[README.md](https://github.com/user-attachments/files/30855137/README.md)
# Painel PipeLovers × Redarbor — v5 (com indicador de PDI)

## O que mudou nesta versão

Foi adicionado o indicador **Progresso do PDI** (Plano de Desenvolvimento Individual) em todo o painel:
geral, por área, por gerência, por liderança e por membro.

- **Como funciona**: cada membro que tem um PDI (arquivo em PDF gerado pela PipeLovers) tem uma lista de
  aulas recomendadas. O painel compara essa lista com as aulas que aparecem na coluna "Conteúdo" do
  `redarbor*.csv` (o mesmo CSV de consumo que você já sobe todo dia) e calcula quantas dessas aulas
  específicas do PDI já foram assistidas.
- **Quem não tem PDI atribuído** simplesmente não aparece nos cálculos de progresso (não conta como "0%"
  — aparece como "Sem PDI"), para não distorcer as médias da liderança/gerência/área.
- Isso aparece:
  - Como 2 novos cards de KPI ("Progresso médio do PDI" e "% que concluiu o PDI") em toda tela.
  - Como coluna nas tabelas comparativas (por área / por gerência) e na tabela de membros.
  - Como uma seção com barra de progresso e checklist de aulas dentro do modal de cada membro.
  - Nas exportações em CSV (colunas extras) e PDF (KPIs extras + coluna extra nas tabelas).

## Arquivo novo: `data/pdi.csv`

Formato (2 colunas, uma linha por aula do PDI de cada pessoa):

```
Email,Aula PDI
fulano@empresa.com,Nome exato da aula 1
fulano@empresa.com,Nome exato da aula 2
```

- O **nome da aula** precisa ser escrito exatamente como aparece na coluna "Conteúdo" do `redarbor*.csv`
  (o painel ignora maiúsculas/minúsculas, acentos e espaços extras na comparação, mas o texto em si
  precisa ser o mesmo curso).
- Quem não tiver nenhuma linha nesse arquivo é tratado como "sem PDI atribuído".

**Este arquivo já vem pronto** com o progresso de 136 pessoas, extraído diretamente dos PDFs de PDI que
estavam na pasta do Google Drive que você compartilhou. Não é preciso gerar nada manualmente agora.

### Como manter isso atualizado no futuro

O indicador de progresso do PDI **atualiza sozinho** toda vez que você sobe um novo `redarbor_AAAA-MM-DD.csv`
— porque a comparação é feita em tempo real contra o `pdi.csv`, não precisa reprocessar nada.

O que só muda manualmente é a **lista de aulas de cada PDI** (o `pdi.csv` em si), e isso só precisa ser
atualizado quando:
- uma pessoa nova entra e ganha um PDI novo, ou
- o PDI de alguém é reformulado (aulas trocadas).

Nesses casos, me envie o link do PDF do PDI (ou da pasta do Drive com os PDIs) e eu gero as linhas novas
para você adicionar ao `pdi.csv`.

## Onde subir os arquivos no GitHub

Estrutura final esperada no repositório (substitui a v4 anterior):

```
seu-repositorio/
├── index.html                          ← substitui o index.html atual (raiz do repo)
└── data/
    ├── membros.csv                     ← igual ao que já está lá (não muda)
    ├── redarbor_2026-08-06.csv         ← igual ao que já está lá (não muda)
    ├── redarbor_AAAA-MM-DD.csv         ← seus uploads diários continuam normalmente
    └── pdi.csv                         ← NOVO — sobe uma vez, na pasta data/
```

Passo a passo:
1. No GitHub, abra a pasta `data/` do repositório.
2. "Add file → Upload files" e suba o `pdi.csv` (deste pacote) dentro de `data/`.
3. Substitua o `index.html` da raiz do repositório pelo `index.html` deste pacote.
4. Nada mais muda no seu fluxo diário — continue subindo `redarbor_AAAA-MM-DD.csv` em `data/` normalmente.

Se por qualquer motivo o `data/pdi.csv` não for encontrado no repositório, o painel continua funcionando
normalmente (só não mostra os cards e colunas de PDI, com um aviso discreto no rodapé do cabeçalho).

## Testado e validado

- Cálculo de progresso do PDI por membro, liderança, gerência, área e geral.
- Coluna de PDI nas tabelas comparativas e na tabela de membros.
- Seção de PDI (barra de progresso + checklist) dentro do modal do membro.
- Exportação CSV com as colunas: `Possui PDI`, `Total de aulas do PDI`, `Aulas do PDI concluidas`, `% do PDI concluido`.
- Exportação PDF: 23 páginas geradas corretamente (1 visão geral + 2 áreas + 5 gerências + 15 lideranças),
  todas com os KPIs de PDI.
- Todo o restante do painel (filtros, links de acesso por área/gerência/liderança, navegação) continua
  funcionando exatamente como na v4 — nada foi removido, só adicionado.
