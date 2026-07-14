# Pipelovers × Redarbor — Painel de Performance

Dashboard estático (HTML/CSS/JS puro, sem build, sem backend) para acompanhamento de aulas
assistidas na Pipelovers pelos times da Redarbor, organizado por liderança.

Os dados **não ficam gravados no código** — o painel lê diretamente os arquivos CSV a cada
vez que a página é aberta. Isso permite que a atualização diária seja só um upload de arquivo
no GitHub, sem precisar mexer em código.

## Arquivos deste pacote

```
index.html          → estrutura e estilo (cores/tipografia da marca Pipelovers)
app.js               → lógica: leitura dos CSVs, filtros, tabelas, gráficos, exportação PDF
data/membros.csv     → líder → membro → e-mail (estrutura dos times)
data/redarbor.csv    → nome, e-mail, aula assistida, data (consumo diário)
```

## 1. Publicar em github.com/gabrielsbrasil

1. Acesse **https://github.com/new**, logado como `gabrielsbrasil`.
2. Nome do repositório sugerido: `redarbor-dashboard` (pode ser público ou privado — Pages
   funciona nos dois casos; em repositório privado, verifique se seu plano do GitHub inclui
   Pages para repositórios privados).
3. Crie o repositório vazio (sem README/gitignore, para evitar conflito).
4. Na página do repositório recém-criado, clique em **"uploading an existing file"** (ou
   **Add file → Upload files**) e arraste os 4 itens deste pacote **mantendo a pasta `data/`**:
   - `index.html`
   - `app.js`
   - `data/membros.csv`
   - `data/redarbor.csv`
5. Clique em **Commit changes**.
6. Vá em **Settings → Pages**. Em **Source**, selecione a branch `main` e a pasta `/ (root)`.
   Salve.
7. Aguarde 1–2 minutos. O link do painel ficará:
   ```
   https://gabrielsbrasil.github.io/redarbor-dashboard/
   ```
   Esse é o link para compartilhar com as lideranças e a diretoria da Redarbor.

> ⚠️ O painel precisa ser acessado via `http(s)://` (GitHub Pages, ou qualquer servidor local).
> Abrir o `index.html` direto do disco (`file://`) bloqueia a leitura dos CSVs por segurança do
> navegador — é uma limitação do navegador, não do painel.

## 2. Atualização diária (o fluxo que você já pretende usar)

Sempre que tiver uma nova exportação do consumo da Pipelovers:

1. No repositório, entre na pasta `data/`.
2. Clique em **Add file → Upload files**.
3. Arraste o novo CSV **com o nome exato `redarbor.csv`** — o GitHub vai avisar que o arquivo
   já existe e perguntar se quer **substituir**; confirme.
4. Clique em **Commit changes** (direto na branch `main`).
5. Em cerca de 30–60 segundos o GitHub Pages já está servindo o arquivo novo. Basta atualizar
   a página do painel (F5) — como ele lê o CSV a cada carregamento, os números batem na hora,
   sem precisar de nenhum passo extra nem de mim.

Se a estrutura de líderes/times mudar (alguém novo, alguém saiu, trocou de liderança), o
mesmo vale para `data/membros.csv`: suba o arquivo atualizado do mesmo jeito, mantendo o nome
`membros.csv` e as 3 colunas originais (`LIDER/Gestão`, `Nome completo do membro`,
`E-mail do membro`).

**Importante:** o CSV de consumo precisa manter exatamente estas 4 colunas, nesta ordem/nome:
`Nome, Email, Conteúdo, Data` — com a data no formato `dd/mm/aaaa hh:mm` (é o formato que a
própria Pipelovers já exporta).

## O que o painel faz

- **Barra lateral**: "Visão geral" + uma aba para cada uma das 15 lideranças diretas
  identificadas em `data/membros.csv`.
- **Filtro de período** (topo, válido em todas as abas): filtra pela **data em que a aula foi
  assistida**. Atalhos: 7 dias, 30 dias, mês atual, tudo — sempre relativos à data mais recente
  presente no CSV carregado.
- **Filtro de liderança** (multi-seleção, caixas de marcação): usado na Visão Geral para
  restringir o ranking/detalhe a uma ou mais lideranças.
- **Clique no nome do colaborador**: expande a lista de aulas assistidas com data/hora de cada uma.
- **Exportar PDF**: gera um PDF com capa (KPIs gerais + ranking de times) e uma página por
  liderança, com a lista completa de membros, aulas assistidas e último acesso — pronto para
  apresentação à diretoria. Respeita o filtro de período ativo no momento do clique.
- Times que também são liderados por outra liderança (hierarquia em 2 níveis, ex. Thomas Costa
  → Daniela → equipe da Daniela) aparecem com a marca **"lidera outro time →"**, permitindo
  navegar direto para a sub-equipe.

## Como o painel casa "aula assistida" com "membro"

A cada carregamento, o `app.js`:

1. Lê `data/membros.csv` e monta a estrutura líder → membros.
2. Lê `data/redarbor.csv` e agrupa as aulas assistidas por **nome normalizado** (maiúsculas,
   sem espaços duplicados) — essa é a chave mais confiável, porque identificamos que a coluna
   de e-mail em `membros.csv` tem inconsistências (ver abaixo).
3. Quando o nome bate, usa o e-mail real de consumo para exibir na tela (mesmo que o e-mail
   cadastrado em `membros.csv` esteja diferente) e sinaliza a divergência.
4. Quando o e-mail cadastrado em `membros.csv` pertence comprovadamente a **outra pessoa** e o
   nome não bate com nenhum registro de consumo, **nenhuma aula é atribuída**, para não misturar
   dados de dois colaboradores diferentes.

## Aviso de qualidade de dados encontrado na carga inicial

Ao cruzar as duas planilhas enviadas, identifiquei que o bloco de membros da liderança
**Letícia Santos** repete, por erro de copiar/colar, os mesmos e-mails do bloco da liderança
**Juliana Braga** logo acima na planilha `membros.csv`. O painel já contorna isso casando por
nome (ver seção acima) e mostra um aviso amarelo dentro da aba da Letícia Santos. Ainda assim,
recomendamos corrigir os e-mails dos seguintes 8 colaboradores diretamente na próxima versão de
`data/membros.csv`, para manter a fonte de dados limpa:

- Arielly Bernardino Silva, Cleidiana Silva Targino, Ivone Silva Oliveira dos Santos, Jessica
  Daiane da S. Oliveira Mendonça, Lumaria Roldão Pereira — corrigidos automaticamente via nome.
- Darlane Cardozo da Silva, Livia Ellen de Oliveira Silva, Stefane Vitor de Jesus — sem dado de
  consumo atribuído, pois o e-mail da planilha pertence a outro colaborador.
