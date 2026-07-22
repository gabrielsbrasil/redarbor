[README.md](https://github.com/user-attachments/files/30268295/README.md)
# Painel PipeLovers × Redarbor — v2 (indicadores % + export CSV + links por liderança)

Esta é a atualização do painel dinâmico (busca os CSVs direto do GitHub, sem
build manual). **Só o `index.html` mudou** — a estrutura de dados e o
workflow diário de upload de CSV continuam exatamente iguais aos que você já
está usando.

## O que mudou nesta versão

### 1. Exportar em CSV (além do PDF já existente)
O botão **"⭳ Exportar"** no topo agora abre um menu com as opções
disponíveis para o que você está vendo:
- Na aba de um time: **PDF — este time** / **CSV — este time**, e também
  **PDF — todos os times** / **CSV — todos os times**.
- Na Visão geral: só as opções de **todos os times**.
- Em um link de liderança (modo travado, veja abaixo): só as opções do
  **próprio time**.

O CSV traz uma linha por aula assistida (dados de consumo por pessoa),
com as colunas:

`Lideranca, Nome, Email, Aulas assistidas no periodo, Ultimo acesso, Logou no periodo, Assistiu 3+ aulas no periodo, Aula assistida, Data da aula`

Membros sem nenhuma aula no período filtrado aparecem com uma linha única
(colunas de aula/data em branco), para que ninguém "suma" do relatório.
O arquivo já sai com acentuação correta para abrir direto no Excel.

### 2. Dois novos indicadores: % que logou e % que assistiu 3+ aulas
Calculados **de forma geral (toda a Redarbor) e por liderança**, sempre
considerando o filtro de data/mês ativo no momento (por padrão, "todo o
período"):

- **% que logou** = membros com pelo menos 1 aula assistida no período ÷
  total de membros do time (ou da empresa, na Visão geral).
- **% que assistiu 3+ aulas** = membros com 3 ou mais aulas assistidas no
  período ÷ total de membros.

Aparecem como cards de KPI tanto na Visão geral quanto em cada aba de
liderança, e a Visão geral também ganhou dois rankings novos comparando
os 15 times entre si nesses dois indicadores. Os dois também entram nas
exportações em PDF e CSV.

> Se quiser o número "histórico" (desde sempre, sem filtro), basta clicar em
> **"Limpar filtros"** antes de exportar/olhar — isso remove o filtro de
> data e os indicadores passam a considerar todo o histórico carregado.

### 3. Link exclusivo por liderança
Agora existem dois tipos de acesso ao mesmo `index.html`:

- **Link geral** (o link normal do site, sem parâmetros) → visão completa,
  com todas as 15 abas, Visão geral, e exportação "todos os times". Este é
  o link para a diretoria.
- **Link por liderança**, no formato:
  ```
  https://SEU-LINK-DO-GITHUB-PAGES/?time=NOME-DO-TIME
  ```
  Abre o painel já travado naquele time: esconde o menu lateral e as demais
  lideranças, mostra só os KPIs/gráficos/tabela daquele time, e as opções
  de exportação (PDF/CSV) ficam restritas aos dados do próprio time.

Para pegar o link de cada liderança sem precisar montar a URL manualmente,
clique em **"🔗 Links por liderança"** no topo (só aparece na visão
geral/admin) — abre uma lista com um botão **Copiar** para o link geral e
para o link de cada uma das 15 lideranças.

## Aviso sobre o link por liderança — leia antes de distribuir

Esse "link exclusivo" é uma **conveniência de navegação**, não uma barreira
de segurança: como o repositório precisa ser público para o painel funcionar
(conforme já avisado na primeira entrega), qualquer pessoa com conhecimento
técnico ainda consegue ver os dados de outro time removendo o `?time=...` da
URL ou acessando os CSVs brutos direto no GitHub. Use os links por liderança
para organizar a experiência de cada gestor (cada um só vê o que precisa por
padrão), mas não trate isso como controle de acesso real — se isso for um
requisito, é necessário um backend com autenticação, o que foge do escopo de
um site estático no GitHub Pages.

## Arquivos deste pacote

| Arquivo | Onde vai no repositório |
|---|---|
| `index.html` | Raiz do repositório (substitui o `index.html` atual) |
| `data/lista_membros_por_lideranca.csv` | Já deve existir no seu repo — não precisa reenviar, é só referência |
| `data/redarbor_2026-07-14.csv` | Idem — arquivo de exemplo, mantenha os que você já subiu |

**Você só precisa substituir o `index.html` no GitHub.** A pasta `data/`
com os CSVs e o workflow diário de upload continuam exatamente como
estavam. O bloco `DASHBOARD_CONFIG` no topo do arquivo já está com a mesma
estrutura de antes — se você já tinha preenchido `repo` com o nome do seu
repositório na versão anterior, copie esse mesmo valor para este novo
arquivo (ou apenas edite esse único campo depois de subir).

### Como atualizar no GitHub
1. No repositório, abra o `index.html` atual e clique no ícone de lápis
   (editar).
2. Apague todo o conteúdo e cole o conteúdo deste novo `index.html`.
3. Confirme que o bloco `DASHBOARD_CONFIG` no topo continua com
   `owner`/`repo`/`branch` corretos (os mesmos que você já configurou).
4. Commit direto na branch `main`.
5. Pronto — o GitHub Pages atualiza sozinho em ~1 minuto, e os CSVs em
   `data/` continuam sendo lidos normalmente, sem precisar reenviar nada.

## Recapitulando o que o painel já fazia (sem mudanças)
- Busca os CSVs direto do repositório a cada carregamento (ou ao clicar em
  "⟳ Atualizar dados").
- 1 aba por liderança + Visão geral consolidada.
- Filtro por intervalo de datas / mês, e por membro (multi-seleção).
- Clique no membro → histórico completo de aulas assistidas.
- Visual dark blue da PipeLovers, tipografia Poppins.
