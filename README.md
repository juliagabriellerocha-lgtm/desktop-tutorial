# Painel da Ju

Painel pessoal da Júlia Rocha para organizar vida pessoal, formação, rotina profissional e finanças em um único lugar.

## Usar

Abra `index.html` em um navegador moderno. As alterações são salvas no armazenamento local do navegador; não há conta, sincronização entre dispositivos ou envio dos dados a um servidor. Use **Exportar backup** para guardar uma cópia JSON e **Restaurar backup** para recuperá-la. A restauração substitui os dados locais atuais.

## Hospedagem privada

O código-fonte inclui informações pessoais, de saúde, dívidas, finanças e trabalho. Mantenha o repositório privado e hospede o painel somente atrás de autenticação. Tornar o repositório privado **não** torna privada uma cópia já publicada. GitHub Pages sem uma camada de autenticação não é uma hospedagem privada.

Para publicar com Cloudflare Pages e Cloudflare Access:

1. Desative e remova qualquer publicação do GitHub Pages antes de disponibilizar este conteúdo. Confira também se não há um workflow de Actions publicando o site.
2. Antes de permitir um deploy com estes arquivos, configure Cloudflare Access para exigir autenticação e uma política de permissão restrita à sua identidade. A integração Git de Pages pode criar URLs de preview públicas por padrão; pause os deploys automáticos enquanto prepara a proteção.
3. Proteja **cada hostname** do projeto: ative a Access policy de previews em **Workers & Pages > projeto > Settings > General**; proteja também o domínio de produção `*.pages.dev` e, se usado, o domínio personalizado, criando as aplicações Access correspondentes. A proteção de previews, sozinha, não protege o domínio de produção nem o domínio personalizado.
4. Antes de usar, teste em uma janela anônima sem autenticação que sejam negados o endereço principal e todas as rotas e arquivos, incluindo `/`, `/index.html`, `/manifest.webmanifest`, `/service-worker.js` e os ícones. Repita para URLs de produção, preview e aliases de branches. Um asset acessível sem autenticação também expõe o painel.

Consulte a documentação oficial: [Git integration](https://developers.cloudflare.com/pages/configuration/git-integration/), [proteção de previews](https://developers.cloudflare.com/pages/configuration/preview-deployments/#customize-preview-deployments-access) e [proteção de `*.pages.dev` e domínio personalizado](https://developers.cloudflare.com/pages/platform/known-issues/#enable-access-on-your-pagesdev-domain). O arquivo `_headers` também pede que navegadores não armazenem respostas e que crawlers cooperativos não indexem o site; isso **não** substitui Cloudflare Access.

## Instalar no celular

Depois de publicar em HTTPS e verificar a autenticação em todos os hostnames, instale o PWA:

- **Android:** abra o endereço autenticado no Chrome e toque em **Instalar app** (ou use o menu ⋮ > **Instalar app** / **Adicionar à tela inicial**).
- **iPhone:** abra o endereço autenticado no Safari, toque em **Compartilhar** e escolha **Adicionar à Tela de Início**.

O painel precisa de conexão e autenticação para carregar: o service worker não armazena o HTML nem oferece acesso offline, pois o próprio HTML contém dados pessoais. Ele mantém apenas o manifesto e os ícones do PWA em cache. Dispositivos que abriram a versão anterior devem se conectar novamente para atualizar o service worker e apagar o cache antigo; limpar os dados do site também remove esse cache. Os dados editados continuam em `localStorage` no perfil do navegador daquele dispositivo; Access não protege dados já carregados no navegador nem os apaga ao encerrar a sessão. Use somente dispositivos confiáveis, proteja backups exportados e limpe os dados do site em dispositivos compartilhados. Para transferir dados entre dispositivos, exporte e restaure um backup com cuidado.

Desativar uma hospedagem não apaga cópias já baixadas ou armazenadas em cache, e tornar o repositório privado não remove dados dos commits existentes. Revise e restrinja acessos a deployments existentes. Este trabalho não altera a visibilidade do repositório nem reescreve o histórico Git.

## Áreas incluídas

- **Hoje:** agenda, check-in da rotina, treino, cardápio e lembretes.
- **Metas & Sonhos:** objetivos profissionais e pessoais, horizontes e desejos.
- **Dívidas:** itens confirmados, processos em detalhamento e acompanhamento de quitações.
- **Dieta, Treino e Rotina:** planejamento informado, registros diários, hidratação e progresso.
- **Compras, Leitura e Espiritualidade:** listas, metas de leitura e anotações diárias.
- **Estudos Acadêmicos e Complementares:** Administração EAD na Faculdade Sebrae, calendário letivo, TripleTen, copywriting e trilhas de IA.
- **Profissional:** indicadores, diagnóstico comercial, gaps e plano de ação da HDL — São José dos Campos.
- **Progresso e Projeções:** evolução recente, revisão semanal e prioridades por área.
- **Financeiro:** resumo atualizado pelo relatório de 07/10/2026, entradas e saídas mensais, categorias, pagamentos do Lar, acerto confirmado e provisório, comparações por setor e projeções individuais e da casa. Setembro e outubro têm cobertura parcial; classificações sugeridas e valores pendentes estão sinalizados. Os campos mensais continuam editáveis e salvam automaticamente.

As informações históricas foram mantidas como fornecidas. O resumo financeiro foi carregado do arquivo anexo de 07/10/2026; as 35 classificações sugeridas e a ausência de extratos/listas recentes permanecem indicadas como pendências, não como fatos confirmados. Confirme os valores antes de tomar decisões financeiras, profissionais ou de saúde. O plano de suplementos de 2024 no painel original já traz aviso para não retomá-los sem validação com a nutricionista.

## Identidade visual

Inspirada na marca pessoal Júlia Rocha: petróleo (`#0E5552`), ameixa (`#2E1F2B`), blush (`#F3E7E2`), pérola (`#FBF8F6`), sálvia (`#D6E4DF`), grafite (`#5A4E57`) e rosa de acento (`#D99AA0`). Combina Cormorant Garamond nos títulos e Jost nos textos.
