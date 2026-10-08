-- Apply this migration after schema.sql.

create table public.recurring_rules (
  id uuid primary key default gen_random_uuid(),
  space_id uuid not null references public.couple_spaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  direction text not null check (direction in ('income', 'expense')),
  visibility text not null check (visibility in ('personal', 'shared')),
  amount numeric(12, 2) not null check (amount > 0),
  category text not null check (char_length(btrim(category)) between 1 and 80),
  description text check (description is null or char_length(description) <= 160),
  day_of_month smallint not null check (day_of_month between 1 and 31),
  next_occurrence date not null,
  ends_on date,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  constraint recurring_shared_entries_are_expenses check (visibility <> 'shared' or direction = 'expense'),
  constraint recurrence_end_is_valid check (ends_on is null or ends_on >= next_occurrence)
);

create index recurring_rules_owner_idx on public.recurring_rules (space_id, user_id, active);
create index recurring_rules_due_idx
  on public.recurring_rules (user_id, next_occurrence)
  where active;
alter table public.recurring_rules enable row level security;
revoke all on public.recurring_rules from anon, authenticated;

create policy "Members can view their own and shared recurring rules"
on public.recurring_rules for select to authenticated
using (
  (select public.is_space_member(space_id))
  and (visibility = 'shared' or user_id = (select auth.uid()))
);

create policy "Members can create their own recurring rules"
on public.recurring_rules for insert to authenticated
with check (
  user_id = (select auth.uid())
  and (select public.is_space_member(space_id))
  and (visibility = 'personal' or direction = 'expense')
);

create policy "Authors can update their own recurring rules"
on public.recurring_rules for update to authenticated
using (user_id = (select auth.uid()) and (select public.is_space_member(space_id)))
with check (user_id = (select auth.uid()) and (select public.is_space_member(space_id)));

create policy "Authors can delete their own recurring rules"
on public.recurring_rules for delete to authenticated
using (user_id = (select auth.uid()) and (select public.is_space_member(space_id)));

grant select, insert, update, delete on public.recurring_rules to authenticated;

alter table public.transactions
  add column recurring_rule_id uuid references public.recurring_rules(id) on delete set null;

create unique index transactions_recurring_occurrence_idx
  on public.transactions (recurring_rule_id, occurred_on)
  where recurring_rule_id is not null;

create function public.validate_recurring_transaction()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.recurring_rule_id is not null and not exists (
    select 1
    from public.recurring_rules as rule
    where rule.id = new.recurring_rule_id
      and rule.space_id = new.space_id
      and rule.user_id = new.user_id
      and rule.direction = new.direction
      and rule.visibility = new.visibility
      and rule.amount = new.amount
      and rule.category = new.category
      and rule.active
  ) then
    raise exception 'Recurring transaction does not match an active rule owned by this user';
  end if;
  return new;
end;
$$;

create trigger transactions_validate_recurring_rule
before insert or update on public.transactions
for each row execute function public.validate_recurring_transaction();

create function public.process_recurring_transactions()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_rule public.recurring_rules%rowtype;
  v_next date;
  v_processed integer := 0;
  v_attempted integer := 0;
  v_inserted integer;
begin
  if (select auth.uid()) is null then
    raise exception 'Authentication required';
  end if;

  for v_rule in
    select rule.*
    from public.recurring_rules as rule
    where rule.user_id = (select auth.uid())
      and rule.active
      and rule.next_occurrence <= current_date
      and (select public.is_space_member(rule.space_id))
    order by rule.next_occurrence
    for update
  loop
    while v_rule.next_occurrence <= current_date
      and (v_rule.ends_on is null or v_rule.next_occurrence <= v_rule.ends_on)
      and v_attempted < 120
    loop
      insert into public.transactions (
        space_id, user_id, direction, visibility, amount, category,
        description, occurred_on, recurring_rule_id
      )
      values (
        v_rule.space_id, v_rule.user_id, v_rule.direction, v_rule.visibility,
        v_rule.amount, v_rule.category, v_rule.description,
        v_rule.next_occurrence, v_rule.id
      )
      on conflict (recurring_rule_id, occurred_on) where recurring_rule_id is not null
      do nothing;
      get diagnostics v_inserted = row_count;
      v_processed := v_processed + v_inserted;
      v_attempted := v_attempted + 1;

      v_next := (date_trunc('month', v_rule.next_occurrence::timestamp) + interval '1 month')::date;
      v_next := v_next + least(
        v_rule.day_of_month,
        extract(day from (v_next + interval '1 month - 1 day'))::integer
      ) - 1;

      if v_rule.ends_on is not null and v_next > v_rule.ends_on then
        update public.recurring_rules set active = false where id = v_rule.id;
        v_rule.active := false;
      else
        update public.recurring_rules set next_occurrence = v_next where id = v_rule.id;
        v_rule.next_occurrence := v_next;
      end if;
    end loop;
  end loop;

  return v_processed;
end;
$$;

revoke all on function public.validate_recurring_transaction() from public, anon, authenticated;
revoke all on function public.process_recurring_transactions() from public, anon;
grant execute on function public.process_recurring_transactions() to authenticated;

create table public.monthly_budgets (
  id uuid primary key default gen_random_uuid(),
  space_id uuid not null references public.couple_spaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  visibility text not null check (visibility in ('personal', 'shared')),
  category text not null check (char_length(btrim(category)) between 1 and 80),
  month_start date not null check (extract(day from month_start) = 1),
  limit_amount numeric(12, 2) not null check (limit_amount > 0),
  created_at timestamptz not null default now()
);

create index monthly_budgets_space_month_idx on public.monthly_budgets (space_id, month_start);
create unique index monthly_budgets_personal_unique_idx
  on public.monthly_budgets (space_id, user_id, category, month_start)
  where visibility = 'personal';
create unique index monthly_budgets_shared_unique_idx
  on public.monthly_budgets (space_id, category, month_start)
  where visibility = 'shared';
alter table public.monthly_budgets enable row level security;
revoke all on public.monthly_budgets from anon, authenticated;

create policy "Members can view their own and shared budgets"
on public.monthly_budgets for select to authenticated
using (
  (select public.is_space_member(space_id))
  and (visibility = 'shared' or user_id = (select auth.uid()))
);

grant select on public.monthly_budgets to authenticated;

create function public.set_monthly_budget(
  p_space_id uuid,
  p_visibility text,
  p_category text,
  p_month_start date,
  p_limit_amount numeric
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if (select auth.uid()) is null or not (select public.is_space_member(p_space_id)) then
    raise exception 'Authentication required for a member of this space';
  end if;
  if p_visibility not in ('personal', 'shared')
    or char_length(btrim(coalesce(p_category, ''))) not between 1 and 80
    or extract(day from p_month_start) <> 1
    or p_limit_amount is null or p_limit_amount <= 0
  then
    raise exception 'Invalid budget details';
  end if;

  if p_visibility = 'shared' then
    insert into public.monthly_budgets (space_id, user_id, visibility, category, month_start, limit_amount)
    values (p_space_id, (select auth.uid()), p_visibility, btrim(p_category), p_month_start, p_limit_amount)
    on conflict (space_id, category, month_start) where visibility = 'shared'
    do update set limit_amount = excluded.limit_amount
    returning id into v_id;
  else
    insert into public.monthly_budgets (space_id, user_id, visibility, category, month_start, limit_amount)
    values (p_space_id, (select auth.uid()), p_visibility, btrim(p_category), p_month_start, p_limit_amount)
    on conflict (space_id, user_id, category, month_start) where visibility = 'personal'
    do update set limit_amount = excluded.limit_amount
    returning id into v_id;
  end if;
  return v_id;
end;
$$;

revoke all on function public.set_monthly_budget(uuid, text, text, date, numeric) from public, anon;
grant execute on function public.set_monthly_budget(uuid, text, text, date, numeric) to authenticated;
