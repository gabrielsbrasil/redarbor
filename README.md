[README.md](https://github.com/user-attachments/files/30313072/README.md)
# Painel PipeLovers × Redarbor — v3 (Áreas + Liderança)

Esta atualização reestrutura o painel em torno de **Área → Liderança**,
seguindo a nova planilha de membros (`membros.csv`, com a coluna `AREA`:
GROWTH B2B PYMES e GROWTH B2B GRANDES EMPRESAS). Todo o resto do sistema
(busca dinâmica dos CSVs no GitHub, filtros de data/mês, exportação em
PDF/CSV, links exclusivos) continua funcionando do mesmo jeito, só que agora
com um nível a mais de agrupamento.

## O que mudou nesta versão

### 1. Fonte de dados: `membros.csv` (substitui o CSV de membros anterior)
A nova planilha de membros tem 4 colunas:

`AREA, LÍDER/GESTÃO, NOME COMPLETO, E-MAIL DO MEMBRO`

Isso substitui o antigo `lista_membros_por_lideranca.csv` — o painel agora
espera o arquivo em `data/membros.csv` (o bloco `DASHBOARD_CONFIG` já vem
atualizado com esse caminho). O `redarbor.csv` de consumo continua igual,
sem mudanças de formato.

### 2. Menu lateral em árvore: Área → Liderança
A barra lateral agora mostra:
- **Visão geral** (tudo: todas as áreas e lideranças)
- **GROWTH B2B GRANDES EMPRESAS** (aba da área, com o rollup de todas as
  lideranças dessa área) → e, abaixo, cada liderança da área
- **GROWTH B2B PYMES** (mesma lógica)

Clicar no nome da área abre uma visão consolidada daquela área (KPIs,
ranking das lideranças dentro dela, gráfico de consumo, tabela com todos os
membros da área e a liderança de cada um). Clicar numa liderança abre a
visão individual daquele time, como antes.

### 3. Indicadores agora em 3 níveis
`% que logou` e `% que assistiu 3+ aulas` continuam sendo calculados sobre o
período filtrado, mas agora em três granularidades:
- **Geral** (toda a Redarbor) — na Visão geral, incluindo uma tabela
  comparativa entre as 2 áreas.
- **Por área** — na aba de cada área, com ranking das lideranças daquela
  área nesses dois indicadores.
- **Por liderança** — na aba de cada time, como já era.

### 4. Exportar PDF e CSV também por área
O menu **"⭳ Exportar"** ganhou uma camada extra:
- Na aba de uma **área**: PDF/CSV da área inteira (todas as suas
  lideranças) + a opção "geral" (todas as áreas).
- Na aba de uma **liderança**: PDF/CSV deste time + da área a que ele
  pertence + geral.
- O CSV agora tem a coluna **Área** além de Liderança, Nome, Email, aulas,
  último acesso etc. — uma linha por aula assistida, cobrindo geral, por
  área ou por liderança conforme o que você exportar.
- O PDF "geral" agora traz: 1 página de resumo com comparativo entre áreas
  → 1 página de resumo por área → 1 página por liderança dentro dela.

### 5. Três tipos de link para compartilhar
| Link | O que mostra | Quem deve receber |
|---|---|---|
| **Geral** (sem parâmetro) | Todas as áreas e lideranças, indicadores gerais, exportação completa | Diretoria / visão executiva |
| `?area=<slug>` | Só aquela área: rollup da área + todas as lideranças **dela** (as outras áreas ficam completamente escondidas do menu) | Gestor(a) responsável pela área inteira |
| `?time=<slug>` | Só aquela liderança, sem menu lateral | Cada líder individual — só vê o próprio time |

Clique em **"🔗 Links por liderança"** no topo (visível apenas na visão
geral/admin) para ver a lista com os 3 tipos de link e um botão de copiar
para cada — inclui o link de cada uma das 2 áreas e das 15 lideranças.

**Confirmei em teste**: acessando pelo link de uma liderança específica, o
menu lateral fica completamente oculto e só os dados daquele time aparecem —
não há como ver as outras lideranças ou áreas por essa rota. O mesmo vale
para o link de área (só a área liberada aparece no menu; a outra fica
totalmente escondida).

> Vale repetir o aviso da entrega anterior: como o repositório GitHub
> precisa ser público para o painel funcionar sem um servidor por trás, esse
> controle de acesso por link é uma organização de navegação, não uma
> segurança à prova de manipulação técnica direta da URL/API do GitHub. Para
> controle de acesso real seria necessário um backend com autenticação.

## Arquivos deste pacote

| Arquivo | Onde vai no repositório |
|---|---|
| `index.html` | Raiz do repositório (substitui o `index.html` atual) |
| `data/membros.csv` | Nova fonte de membros — sobe em `data/`, **no lugar** do antigo `lista_membros_por_lideranca.csv` |
| `data/redarbor_2026-07-23.csv` | Carga de consumo mais recente enviada — some com as demais que você já tem em `data/` |

### Passo a passo para atualizar no GitHub
1. Suba o novo `data/membros.csv` na pasta `data/` do repositório (pode
   apagar o `lista_membros_por_lideranca.csv` antigo, ele não é mais usado).
2. Suba o novo `data/redarbor_2026-07-23.csv` — mantenha os arquivos
   `redarbor*.csv` anteriores, o painel soma todos automaticamente.
3. Substitua o `index.html` da raiz pelo novo.
4. Confira que o bloco `DASHBOARD_CONFIG` no topo do `index.html` está com
   `owner`/`repo`/`branch` corretos (os mesmos que você já tinha
   configurado — copie o valor de `repo` do arquivo antigo se precisar).
5. Commit direto na branch `main`. O GitHub Pages atualiza em ~1 minuto.

Se o CSV de membros mudar de novo no futuro (nova área, novo líder, membro
trocando de time), basta subir uma nova versão de `data/membros.csv` — o
painel reconstrói toda a árvore Área → Liderança sozinho a cada carregamento.

## O que continua igual
- Busca os dados direto do GitHub a cada carregamento (ou botão "⟳ Atualizar
  dados").
- Filtro por intervalo de datas / mês e por membro (multi-seleção),
  respeitado em todos os níveis (geral, área, liderança).
- Clique no membro → histórico completo de aulas assistidas.
- Visual dark blue da PipeLovers, tipografia Poppins.
