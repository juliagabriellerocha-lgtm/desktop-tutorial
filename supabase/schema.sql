create table public.couple_spaces (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 1 and 80),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);

create table public.space_members (
  space_id uuid not null references public.couple_spaces(id) on delete cascade,
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null check (char_length(btrim(display_name)) between 1 and 80),
  joined_at timestamptz not null default now()
);

create table public.space_invites (
  space_id uuid not null references public.couple_spaces(id) on delete cascade,
  code uuid primary key default gen_random_uuid(),
  expires_at timestamptz not null default (now() + interval '7 days'),
  created_at timestamptz not null default now()
);

create table public.transactions (
  id uuid primary key default gen_random_uuid(),
  space_id uuid not null references public.couple_spaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  direction text not null check (direction in ('income', 'expense')),
  visibility text not null check (visibility in ('personal', 'shared')),
  amount numeric(12, 2) not null check (amount > 0),
  category text not null check (char_length(btrim(category)) between 1 and 80),
  description text check (description is null or char_length(description) <= 160),
  occurred_on date not null,
  created_at timestamptz not null default now(),
  constraint shared_entries_are_expenses check (visibility <> 'shared' or direction = 'expense')
);

create index space_members_space_idx on public.space_members (space_id);
create index transactions_space_date_idx on public.transactions (space_id, occurred_on desc);
create index transactions_shared_settlement_idx
  on public.transactions (space_id, user_id, occurred_on)
  where direction = 'expense' and visibility = 'shared';

alter table public.couple_spaces enable row level security;
alter table public.space_members enable row level security;
alter table public.space_invites enable row level security;
alter table public.transactions enable row level security;

revoke all on public.couple_spaces, public.space_members, public.space_invites, public.transactions from anon, authenticated;

create function public.is_space_member(p_space_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.space_members as member
    where member.space_id = p_space_id
      and member.user_id = (select auth.uid())
  );
$$;

revoke all on function public.is_space_member(uuid) from public, anon;
grant execute on function public.is_space_member(uuid) to authenticated;

create policy "Members can view their space"
on public.couple_spaces for select to authenticated
using ((select public.is_space_member(id)));

create policy "Members can view their own membership"
on public.space_members for select to authenticated
using ((select public.is_space_member(space_id)));

create policy "Members can read their own and shared entries"
on public.transactions for select to authenticated
using (
  (select public.is_space_member(space_id))
  and (visibility = 'shared' or user_id = (select auth.uid()))
);

create policy "Members can create their own entries"
on public.transactions for insert to authenticated
with check (
  user_id = (select auth.uid())
  and (select public.is_space_member(space_id))
  and (visibility = 'personal' or direction = 'expense')
);

create policy "Authors can update their own entries"
on public.transactions for update to authenticated
using (
  user_id = (select auth.uid())
  and (select public.is_space_member(space_id))
)
with check (
  user_id = (select auth.uid())
  and (select public.is_space_member(space_id))
);

create policy "Authors can delete their own entries"
on public.transactions for delete to authenticated
using (
  user_id = (select auth.uid())
  and (select public.is_space_member(space_id))
);

grant select on public.couple_spaces, public.space_members to authenticated;
grant select, insert, update, delete on public.transactions to authenticated;

create function public.create_space(p_name text, p_display_name text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_space_id uuid;
  v_invite_code uuid;
begin
  if (select auth.uid()) is null then
    raise exception 'Authentication required';
  end if;
  if char_length(btrim(coalesce(p_name, ''))) not between 1 and 80 then
    raise exception 'Space name must contain between 1 and 80 characters';
  end if;
  if char_length(btrim(coalesce(p_display_name, ''))) not between 1 and 80 then
    raise exception 'Display name must contain between 1 and 80 characters';
  end if;
  if exists (select 1 from public.space_members where user_id = (select auth.uid())) then
    raise exception 'This user already belongs to a space';
  end if;

  insert into public.couple_spaces (name, created_by)
  values (btrim(p_name), (select auth.uid()))
  returning id into v_space_id;

  insert into public.space_members (space_id, user_id, display_name)
  values (v_space_id, (select auth.uid()), btrim(p_display_name));

  insert into public.space_invites (space_id)
  values (v_space_id)
  returning code into v_invite_code;

  return jsonb_build_object('space_id', v_space_id, 'invite_code', v_invite_code);
end;
$$;

create function public.create_space_invite()
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_space_id uuid;
  v_invite_code uuid;
begin
  select member.space_id into v_space_id
  from public.space_members as member
  where member.user_id = (select auth.uid());
  if v_space_id is null then
    raise exception 'Join a space before creating an invite';
  end if;

  perform 1 from public.couple_spaces where id = v_space_id for update;
  if (select count(*) from public.space_members where space_id = v_space_id) >= 2 then
    raise exception 'This space already has two members';
  end if;

  delete from public.space_invites where space_id = v_space_id;
  insert into public.space_invites (space_id)
  values (v_space_id)
  returning code into v_invite_code;
  return v_invite_code;
end;
$$;

create function public.join_space(p_invite_code uuid, p_display_name text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_space_id uuid;
begin
  if (select auth.uid()) is null then
    raise exception 'Authentication required';
  end if;
  if char_length(btrim(coalesce(p_display_name, ''))) not between 1 and 80 then
    raise exception 'Display name must contain between 1 and 80 characters';
  end if;
  if exists (select 1 from public.space_members where user_id = (select auth.uid())) then
    raise exception 'This user already belongs to a space';
  end if;

  select invite.space_id into v_space_id
  from public.space_invites as invite
  where invite.code = p_invite_code
    and invite.expires_at > now()
  for update;
  if v_space_id is null then
    raise exception 'Invite code is invalid, expired, or already used';
  end if;

  perform 1 from public.couple_spaces where id = v_space_id for update;
  if (select count(*) from public.space_members where space_id = v_space_id) >= 2 then
    raise exception 'This space already has two members';
  end if;

  insert into public.space_members (space_id, user_id, display_name)
  values (v_space_id, (select auth.uid()), btrim(p_display_name));
  delete from public.space_invites where code = p_invite_code;
  return v_space_id;
end;
$$;

revoke all on function public.create_space(text, text) from public, anon;
revoke all on function public.create_space_invite() from public, anon;
revoke all on function public.join_space(uuid, text) from public, anon;
grant execute on function public.create_space(text, text) to authenticated;
grant execute on function public.create_space_invite() to authenticated;
grant execute on function public.join_space(uuid, text) to authenticated;

create function public.get_settlement_balance(p_space_id uuid)
returns numeric
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not (select public.is_space_member(p_space_id)) then
    raise exception 'You are not a member of this space';
  end if;

  return (
    select coalesce(sum(
      case
        when t.user_id = (select auth.uid()) then t.amount / 2
        else -t.amount / 2
      end
    ), 0)
    from public.transactions as t
    where t.space_id = p_space_id
      and t.direction = 'expense'
      and t.visibility = 'shared'
      and t.occurred_on <= current_date
  );
end;
$$;

revoke all on function public.get_settlement_balance(uuid) from public, anon;
grant execute on function public.get_settlement_balance(uuid) to authenticated;
