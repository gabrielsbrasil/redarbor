"""
PipeLovers / Redarbor — gera data/redarbor_supabase.csv a partir da view
"vw_consumo_completo" do Supabase.

Substitui o upload manual diário do CSV de consumo (redarbor_AAAA-MM-DD.csv).
A partir de agora, quem alimenta o painel é este script, rodado automaticamente
pelo GitHub Action ".github/workflows/atualizar-redarbor.yml" — o
"build-data-manifest.yml" que já existe no repositório roda em seguida sozinho
(ele dispara em qualquer mudança dentro de "data/") e atualiza o manifest.json.

Se o nome da view ou das colunas no seu Supabase for diferente, ajuste as
constantes VIEW_NAME / COL_* logo abaixo antes de rodar.

Variáveis de ambiente necessárias (via GitHub Actions Secrets):
  SUPABASE_URL                -> ex.: https://rovzsgbbrjbkbjbakwap.supabase.co
  SUPABASE_SERVICE_ROLE_KEY   -> chave "service_role" (Project Settings -> API)
"""
import os
import sys
import csv
from datetime import datetime
from zoneinfo import ZoneInfo

import requests

SUPABASE_URL = os.environ.get("SUPABASE_URL", "").rstrip("/")
SUPABASE_SERVICE_ROLE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")

VIEW_NAME = "vw_consumo_completo"
# Nomes das colunas na view (ajuste se forem diferentes no seu Supabase)
COL_EMAIL = "member_email"
COL_NAME = "member_name"
COL_CONTENT = "content_title"
COL_DATE = "completed_at"

OUTPUT_PATH = "data/redarbor_supabase.csv"
PAGE_SIZE = 1000
BR_TZ = ZoneInfo("America/Sao_Paulo")


def fetch_all_rows():
    if not SUPABASE_URL or not SUPABASE_SERVICE_ROLE_KEY:
        print("ERRO: defina SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY (secrets do GitHub Actions).")
        sys.exit(1)

    headers = {
        "apikey": SUPABASE_SERVICE_ROLE_KEY,
        "Authorization": f"Bearer {SUPABASE_SERVICE_ROLE_KEY}",
    }
    base = f"{SUPABASE_URL}/rest/v1/{VIEW_NAME}"
    select_cols = f"{COL_EMAIL},{COL_NAME},{COL_CONTENT},{COL_DATE}"

    all_rows = []
    offset = 0
    while True:
        params = {
            "select": select_cols,
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
    print(f"Buscando consumo em {SUPABASE_URL}/rest/v1/{VIEW_NAME} ...")
    rows = fetch_all_rows()

    os.makedirs("data", exist_ok=True)
    written = 0
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
            writer.writerow([nome, email, conteudo, data_br])
            written += 1

    print(f"OK: {OUTPUT_PATH} gerado com {written} linha(s) (de {len(rows)} buscada(s) no Supabase).")


if __name__ == "__main__":
    main()
