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
saída deste próprio script) e monta um conjunto de chaves (email + nome da
aula, normalizados). Qualquer linha do Supabase cuja chave já exista nesse
conjunto é IGNORADA — só entra no redarbor_supabase.csv o que é novidade:
  - aulas que o Supabase tem registradas mas que nunca foram
    subidas manualmente (preenche buracos do histórico antigo);
  - qualquer aula assistida de hoje em diante.
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
ID_CONTAS = [380, 382]  # Redarbor (380) + Catho (382)

# Nomes das colunas na view (ajuste se forem diferentes no seu Supabase)
COL_EMAIL = "member_email"
COL_NAME = "member_name"
COL_CONTENT = "content_title"
COL_DATE = "completed_at"
COL_ID_CONTA = "id_conta"

OUTPUT_PATH = "data/redarbor_supabase.csv"
MANUAL_CSV_GLOB = "data/redarbor*.csv"  # todos os manuais antigos, exceto o de saída
PAGE_SIZE = 1000
BR_TZ = ZoneInfo("America/Sao_Paulo")


def normalize(text):
    """minúsculo, sem acento, sem espaços duplicados/nas pontas — pra comparar
    'mesma aula'/'mesmo email' mesmo com pequenas diferenças de digitação."""
    if not text:
        return ""
    text = unicodedata.normalize("NFKD", text).encode("ascii", "ignore").decode("ascii")
    text = text.strip().lower()
    text = re.sub(r"\s+", " ", text)
    return text


def load_already_counted_keys():
    """Lê todos os data/redarbor*.csv manuais já existentes (excluindo o
    OUTPUT_PATH deste script) e devolve o conjunto de chaves (email, aula)
    normalizadas que já foram contabilizadas — pra não duplicar essas mesmas
    aulas vindas do Supabase."""
    keys = set()
    files = [f for f in glob.glob(MANUAL_CSV_GLOB) if os.path.abspath(f) != os.path.abspath(OUTPUT_PATH)]
    if not files:
        print(f"Aviso: nenhum arquivo manual encontrado em {MANUAL_CSV_GLOB} — nenhuma deduplicação será feita.")
        return keys
    for path in files:
        with open(path, encoding="utf-8") as f:
            for row in csv.DictReader(f):
                email = normalize(row.get("Email", ""))
                conteudo = normalize(row.get("Conteúdo", ""))
                if email and conteudo:
                    keys.add((email, conteudo))
        print(f"Lido {path}")
    print(f"{len(keys)} combinação(ões) email+aula já presentes nos CSVs manuais (serão ignoradas do Supabase).")
    return keys


def fetch_all_rows():
    if not SUPABASE_URL or not SUPABASE_SERVICE_ROLE_KEY:
        print("ERRO: defina SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY (secrets do GitHub Actions).")
        sys.exit(1)

    headers = {
        "apikey": SUPABASE_SERVICE_ROLE_KEY,
        "Authorization": f"Bearer {SUPABASE_SERVICE_ROLE_KEY}",
    }
    base = f"{SUPABASE_URL}/rest/v1/{VIEW_NAME}"
    select_cols = f"{COL_EMAIL},{COL_NAME},{COL_CONTENT},{COL_DATE},{COL_ID_CONTA}"
    id_conta_filter = "in.(" + ",".join(str(i) for i in ID_CONTAS) + ")"

    all_rows = []
    offset = 0
    while True:
        params = {
            "select": select_cols,
            COL_ID_CONTA: id_conta_filter,
            "order": f"{COL_DATE}.asc",
            "limit": PAGE_SIZE,
            "offset": offset,
        }
        resp = requests.get(base, headers=headers, params=params, timeout=60)
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
    already_counted = load_already_counted_keys()

    print(f"Buscando consumo em {SUPABASE_URL}/rest/v1/{VIEW_NAME} (id_conta in {ID_CONTAS}) ...")
    rows = fetch_all_rows()

    os.makedirs("data", exist_ok=True)
    written = 0
    skipped_dupe = 0
    seen_in_this_run = set()
    with open(OUTPUT_PATH, "w", newline="", encoding="utf-8") as f:
        writer = csv.writer(f)
        writer.writerow(["Nome", "Email", "Conteúdo", "Data"])
        for r in rows:
            nome = (r.get(COL_NAME) or "").strip()
            email = (r.get(COL_EMAIL) or "").strip()
            conteudo = (r.get(COL_CONTENT) or "").strip()
            data_br = to_br_datetime(r.get(COL_DATE))
            if not email or not conteudo or not data_br:
                continue

            key = (normalize(email), normalize(conteudo))
            if key in already_counted or key in seen_in_this_run:
                skipped_dupe += 1
                continue

            seen_in_this_run.add(key)
            writer.writerow([nome, email, conteudo, data_br])
            written += 1

    print(f"OK: {OUTPUT_PATH} gerado com {written} linha(s) nova(s) "
          f"({skipped_dupe} já estavam contabilizadas e foram ignoradas; "
          f"{len(rows)} linha(s) buscada(s) no total do Supabase).")


if __name__ == "__main__":
    main()
