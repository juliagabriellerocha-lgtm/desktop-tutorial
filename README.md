# Painel Financeiro Ju

Painel financeiro responsivo para duas pessoas, com gastos privados e despesas do lar compartilhadas. A aplicação é estática; autenticação, persistência e autorização são fornecidas pelo Supabase.

## Configurar o Supabase

1. Crie um projeto Supabase e abra o **SQL Editor**.
2. Execute `supabase/schema.sql` e depois `supabase/daily_management.sql`, nesta ordem, no SQL Editor. O segundo arquivo adiciona recorrências e orçamentos ao banco já criado.
3. Em **Authentication → URL Configuration**, configure a URL local `http://localhost:8000` como Site URL durante o desenvolvimento. Para publicar, altere para o domínio do app.
4. Sirva esta pasta por HTTP local (não abra `index.html` diretamente):

   ```powershell
   python -m http.server 8000
   ```

5. Abra `http://localhost:8000`, selecione **Conectar**, e informe a URL do projeto e a chave `anon`/`publishable` pública. A configuração fica no armazenamento local deste navegador.
6. Crie uma conta, confirme o e-mail se o Supabase solicitar e entre. Crie um espaço para gerar um convite; a outra pessoa cria a própria conta e usa esse código. Convites são de uso único e expiram em 7 dias.

Depois de entrar no espaço, use **Novo lançamento**. Entradas são privadas por padrão. Em despesas, escolha **Individual** (somente sua conta pode ler) ou **Conjunto** (visível aos membros). Quem registra uma despesa conjunta é considerado a pessoa que pagou; cada pessoa deve registrar as despesas que pagou para o acerto ficar correto. A divisão é metade para cada pessoa: o saldo individual é o total pago menos metade das despesas compartilhadas.

Para a gestão diária, busque e filtre lançamentos, edite/exclua os que você criou, defina limites mensais por categoria e use **Ver recorrentes** para pausar, retomar ou remover regras. Marque **Repetir mensalmente** no formulário para gerar lançamentos automaticamente quando vencidos. Lançamentos avulsos aceitam datas até hoje; para cobranças mensais futuras, use uma recorrência. O app processa as regras quando abre online; não envia notificações nem agenda execuções no servidor. Despesas recorrentes compartilhadas são registradas como pagas por quem criou a regra.

Use **Baixar meus dados** para exportar um backup JSON da janela de dados carregada (até 5.000 lançamentos de 24 meses), junto com suas regras de recorrência e orçamentos acessíveis. Guarde o arquivo em local privado: ele pode incluir suas despesas individuais. O resumo CSV é somente um resumo, não um backup.

## Publicar e instalar

Este repositório publica pelo GitHub Pages em `https://juliagabriellerocha-lgtm.github.io/desktop-tutorial/`. O workflow `.github/workflows/deploy-pages.yml` publica a branch da PR para validação e `main` após a integração; uma execução manual também pode ser iniciada em **Actions → Deploy finance dashboard → Run workflow**. Não publique chaves administrativas nem dados financeiros em arquivos estáticos.

No Supabase, defina o domínio publicado como **Site URL** e inclua `https://juliagabriellerocha-lgtm.github.io/desktop-tutorial/` e os endereços locais em **Redirect URLs**. Habilite confirmação de e-mail, configure recuperação de senha, limites de autenticação e SMTP próprio para produção.

Abra o endereço HTTPS em um navegador compatível e escolha **Instalar app** quando disponível. Em iPhone/iPad, use Compartilhar → Adicionar à Tela de Início.

O service worker armazena somente o shell estático do app para abrir a interface offline; requisições e respostas do Supabase, sessões e dados financeiros nunca são colocados em cache. Edição, gravação, autenticação, recorrências e atualização de dashboards precisam de internet.

## Segurança

- Não coloque a chave `service_role` neste site, no repositório ou no navegador. A chave pública `anon`/`publishable` é usada com RLS.
- Despesas individuais são protegidas por políticas PostgreSQL RLS — não apenas escondidas na interface. A leitura de cada registro verifica o membro do espaço e o autor, e todas as mutações ficam limitadas ao próprio autor.
- Funções SQL autorizam criar um espaço, emitir convites de uso único e limitar o casal a dois membros. Elas validam a identidade no banco.
- Configure e teste os provedores, a confirmação de e-mail, os limites de autenticação, URLs permitidas e a recuperação de conta nas configurações de Authentication do seu projeto.
- Confira as políticas após aplicar os dois arquivos SQL e antes de inserir dados reais. A aplicação carrega até 5.000 registros dos últimos 24 meses para os gráficos e backup; o total do acerto é calculado no banco sobre todo o histórico.

## Demonstração

Sem configurar o Supabase, o painel funciona com dados fictícios; os valores não são salvos. Para servir apenas a demonstração, também é possível executar `python -m http.server 8000` e abrir `http://localhost:8000`.
