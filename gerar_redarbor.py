"""
PipeLovers / Redarbor — gera data/redarbor_supabase.csv a partir da view
"vw_consumo_completo" do Supabase, filtrado pelas contas Redarbor (id_conta=380)
e Catho (id_conta=382) — as duas juntas formam o painel do redarbor.

Substitui o upload manual diário do CSV de consumo (redarbor_AAAA-MM-DD.csv).
A partir de agora, quem alimenta o painel é este script, rodado automaticamente
pelo GitHub Action ".github/workflows/atualizar-redarbor.yml" (que também
regenera o data/manifest.json no mesmo commit — commits feitos pelo
GITHUB_TOKEN não disparam outros workflows automaticamente, então não dá
pra depender do "build-data-manifest.yml" rodar sozinho depois).

DEDUPLICAÇÃO: para não contar a mesma aula duas vezes (uma vez em algum
redarbor*.csv manual antigo, outra vez no redarbor_supabase.csv novo), este
script lê todos os arquivos data/redarbor*.csv já existentes (exceto o de
saída deste próprio script) e ignora qualquer linha do Supabase que já esteja
lá. Uma linha é considerada "já contabilizada" quando:
  1) o par (email, título da aula) já existe nos CSVs manuais. O título é
     comparado sem acento, sem pontuação e sem diferença de hífen/dois-pontos
     ("Módulo 1: X - Y" == "Módulo 1: X Y"); ou
  2) é uma aula de programa (origem "aula_programa") e os CSVs manuais já têm
     uma linha do mesmo e-mail no mesmo minuto (os CSVs manuais trazem o nome
     do programa e o da aula com títulos diferentes dos da view, mas com o
     mesmo horário de Brasília).

LINHA DO PROGRAMA: o PDI (data/pdi.csv) pode listar um programa inteiro, como
"Programa Especialização em Prospecção" ou "Programa de Gestão de Vendas B2B",
e o index.html só marca como feito quando existe uma linha cujo "Conteúdo" é
exatamente esse nome. Os CSVs manuais antigos traziam essa linha; a view traz
só o título de cada aula. Por isso, para cada (email, programa) com aula
concluída, este script também grava UMA linha com o nome do programa (a menos
que os CSVs manuais já tenham essa linha), usando waid_licoes.pacote_title.

Os CSVs manuais nunca são alterados por este script.

Se o nome da view/colunas ou os id_conta mudarem, ajuste as constantes abaixo.

Variáveis de ambiente necessárias (via GitHub Actions Secrets):
  SUPABASE_URL                -> ex.: https://rovzsgbbrjbkbjbakwap.supabase.co
  SUPABASE_SERVICE_ROLE_KEY   -> chave "service_role" (Project Settings -> API)
"""
import os
import re
import sys
import csv
import glob
import unicodedata
from datetime import datetime
from zoneinfo import ZoneInfo

import requests

SUPABASE_URL = os.environ.get("SUPABASE_URL", "").rstrip("/")
SUPABASE_SERVICE_ROLE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")

VIEW_NAME = "vw_consumo_completo"
LICOES_TABLE = "waid_licoes"
ID_CONTAS = [380, 382]  # Redarbor (380) + Catho (382)

# Nomes das colunas na view (ajuste se forem diferentes no seu Supabase)
COL_EMAIL = "member_email"
COL_NAME = "member_name"
COL_NAME_FALLBACK = "usuario_nome"
COL_CONTENT = "content_title"
COL_DATE = "completed_at"
COL_ID_CONTA = "id_conta"
COL_ORIGEM = "origem"
COL_ORIGEM_ID = "origem_id"  # para aula_programa: "email:lesson_id"

ORIGEM_AULA_PROGRAMA = "aula_programa"

OUTPUT_PATH = "data/redarbor_supabase.csv"
MANUAL_CSV_GLOB = "data/redarbor*.csv"  # todos os manuais antigos, exceto o de saída
PAGE_SIZE = 1000
BR_TZ = ZoneInfo("America/Sao_Paulo")


def normalize(text):
    """minúsculo, sem acento, sem espaços duplicados/nas pontas — usado para e-mail."""
    if not text:
        return ""
    text = unicodedata.normalize("NFKD", text).encode("ascii", "ignore").decode("ascii")
    text = text.strip().lower()
    text = re.sub(r"\s+", " ", text)
    return text


def norm_title(text):
    """Como normalize(), mas também ignora pontuação e hífens, para casar
    'Módulo 1: X - Y' com 'Módulo 1: X Y'."""
    text = normalize(text)
    text = re.sub(r"[^a-z0-9]+", " ", text)
    return text.strip()


def load_manual_data():
    """Lê todos os data/redarbor*.csv manuais (exceto o OUTPUT_PATH).
    Devolve:
      - keys:    {(email, título normalizado)} já contabilizados
      - minutes: {(email, 'DD/MM/AAAA HH:MM')} já contabilizados
    """
    keys = set()
    minutes = set()
    files = [f for f in glob.glob(MANUAL_CSV_GLOB) if os.path.abspath(f) != os.path.abspath(OUTPUT_PATH)]
    if not files:
        print(f"Aviso: nenhum arquivo manual encontrado em {MANUAL_CSV_GLOB} — nenhuma deduplicação será feita.")
        return keys, minutes
    for path in files:
        with open(path, encoding="utf-8") as f:
            for row in csv.DictReader(f):
                email = normalize(row.get("Email", ""))
                conteudo = norm_title(row.get("Conteúdo", ""))
                data = (row.get("Data") or "").strip()
                if email and conteudo:
                    keys.add((email, conteudo))
                if email and data:
                    minutes.add((email, data))
        print(f"Lido {path}")
    print(f"{len(keys)} combinação(ões) email+aula e {len(minutes)} email+minuto já presentes nos CSVs manuais (serão ignoradas do Supabase).")
    return keys, minutes


def supabase_headers():
    return {
        "apikey": SUPABASE_SERVICE_ROLE_KEY,
        "Authorization": f"Bearer {SUPABASE_SERVICE_ROLE_KEY}",
    }


def fetch_paged(url, params, order):
    """Busca todas as páginas. A ordenação precisa ter desempate (chave única),
    senão linhas com o mesmo horário podem se repetir ou sumir entre páginas."""
    all_rows = []
    offset = 0
    while True:
        p = dict(params)
        p["order"] = order
        p["limit"] = PAGE_SIZE
        p["offset"] = offset
        resp = requests.get(url, headers=supabase_headers(), params=p, timeout=60)
        if not resp.ok:
            print(f"ERRO ao consultar Supabase (HTTP {resp.status_code}): {resp.text[:500]}")
            sys.exit(1)
        batch = resp.json()
        if not batch:
            break
        all_rows.extend(batch)
        offset += len(batch)
        print(f"  ...{offset} linha(s) buscada(s) até agora")
        if len(batch) < PAGE_SIZE:
            break
    return all_rows


def fetch_all_rows():
    if not SUPABASE_URL or not SUPABASE_SERVICE_ROLE_KEY:
        print("ERRO: defina SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY (secrets do GitHub Actions).")
        sys.exit(1)

    base = f"{SUPABASE_URL}/rest/v1/{VIEW_NAME}"
    select_cols = ",".join([COL_EMAIL, COL_NAME, COL_NAME_FALLBACK, COL_CONTENT, COL_DATE,
                            COL_ID_CONTA, COL_ORIGEM, COL_ORIGEM_ID])
    id_conta_filter = "in.(" + ",".join(str(i) for i in ID_CONTAS) + ")"
    params = {"select": select_cols, COL_ID_CONTA: id_conta_filter}
    # desempate por origem + origem_id (único por linha) para paginação estável
    order = f"{COL_DATE}.asc,{COL_ORIGEM}.asc,{COL_ORIGEM_ID}.asc"
    return fetch_paged(base, params, order)


def fetch_programa_por_aula():
    """Devolve {lesson_id (int): título do programa} a partir de waid_licoes."""
    base = f"{SUPABASE_URL}/rest/v1/{LICOES_TABLE}"
    rows = fetch_paged(base, {"select": "lesson_id,pacote_title"}, "lesson_id.asc")
    mapa = {}
    for r in rows:
        if r.get("lesson_id") is not None and (r.get("pacote_title") or "").strip():
            mapa[int(r["lesson_id"])] = r["pacote_title"].strip()
    return mapa


def lesson_id_from_origem_id(origem_id):
    """origem_id das aulas de programa tem o formato 'email:lesson_id'."""
    if not origem_id or ":" not in origem_id:
        return None
    tail = origem_id.rsplit(":", 1)[1]
    return int(tail) if tail.isdigit() else None


def to_br_datetime(iso_str):
    """Converte um timestamp ISO (Supabase, UTC) para 'DD/MM/AAAA HH:MM',
    formato que o index.html do painel já sabe interpretar (parseBRDateTime)."""
    if not iso_str:
        return ""
    try:
        dt = datetime.fromisoformat(iso_str.replace("Z", "+00:00"))
    except ValueError:
        return ""
    return dt.astimezone(BR_TZ).strftime("%d/%m/%Y %H:%M")


def main():
    manual_keys, manual_minutes = load_manual_data()

    print(f"Buscando consumo em {SUPABASE_URL}/rest/v1/{VIEW_NAME} (id_conta in {ID_CONTAS}) ...")
    rows = fetch_all_rows()
    print(f"Buscando programa de cada aula em {LICOES_TABLE} ...")
    programa_por_aula = fetch_programa_por_aula()

    os.makedirs("data", exist_ok=True)
    written = 0
    skipped_dupe = 0
    seen_in_this_run = set()
    programas = {}  # (email normalizado) , programa -> (nome, email, data mais antiga em datetime)
    out_rows = []

    for r in rows:
        nome = (r.get(COL_NAME) or r.get(COL_NAME_FALLBACK) or "").strip()
        email = (r.get(COL_EMAIL) or "").strip()
        conteudo = (r.get(COL_CONTENT) or "").strip()
        iso = r.get(COL_DATE)
        data_br = to_br_datetime(iso)
        if not email or not conteudo or not data_br:
            continue

        e_norm = normalize(email)
        eh_programa = r.get(COL_ORIGEM) == ORIGEM_AULA_PROGRAMA

        # Linha do programa (para o PDI): uma por (email, programa), com a data mais antiga.
        if eh_programa:
            lid = lesson_id_from_origem_id(r.get(COL_ORIGEM_ID))
            prog = programa_por_aula.get(lid) if lid is not None else None
            if prog:
                k = (e_norm, norm_title(prog))
                if k not in programas:
                    programas[k] = {"nome": nome, "email": email, "programa": prog, "data": data_br}

        key = (e_norm, norm_title(conteudo))
        ja_contabilizada = key in manual_keys or key in seen_in_this_run
        if not ja_contabilizada and eh_programa and (e_norm, data_br) in manual_minutes:
            ja_contabilizada = True  # mesmo e-mail, mesmo minuto, já nos CSVs manuais
        if ja_contabilizada:
            skipped_dupe += 1
            continue

        seen_in_this_run.add(key)
        out_rows.append([nome, email, conteudo, data_br])
        written += 1

    programa_rows = 0
    for k, p in programas.items():
        if k in manual_keys or k in seen_in_this_run:
            continue
        seen_in_this_run.add(k)
        out_rows.append([p["nome"], p["email"], p["programa"], p["data"]])
        programa_rows += 1

    with open(OUTPUT_PATH, "w", newline="", encoding="utf-8") as f:
        writer = csv.writer(f)
        writer.writerow(["Nome", "Email", "Conteúdo", "Data"])
        writer.writerows(out_rows)

    print(f"OK: {OUTPUT_PATH} gerado com {written} linha(s) de aula nova(s) + {programa_rows} linha(s) de programa "
          f"({skipped_dupe} já estavam contabilizadas e foram ignoradas; "
          f"{len(rows)} linha(s) buscada(s) no total do Supabase).")


if __name__ == "__main__":
    main()
