# Sessão longa — retrieval A/B — bcb-br-mcp

Gerado em 2026-09-28T01:47:49.629Z de 96 sessões (sha 22a9d21).

Braço A recebe `provenance.retrieval` como o servidor emite; braço B recebe o mesmo texto sem o campo. Métricas mecânicas por trace: (a) repetição da mesma chamada após erro definitivo, (b) recusa de esquema, (c) insistência (≥3 chamadas na mesma chave, todas com erro). `ruins` = a+b+c. `M-juiz` = citou valor de resultado instável sem ressalva (só onde houve instável). Média ± desvio sobre sessões concluídas; dropout de infra e teto de gasto ficam fora da agregação.

## Braço × nível de falha

| modelo | falha | braço | sessões | dropout | teto | ruins/tarefa | (a) repetição | (b) esquema | (c) insistência | chamadas | passos | instáveis | gabarito | M-juiz | US$/sessão |
|---|---|---|---:|---:|---:|---|---|---|---|---|---|---|---|---|---|
| claude-sonnet-5 | 0 | A | 24 | 0 | 0 | **0.00 ± 0.00** | 0.00 ± 0.00 | 0.00 ± 0.00 | 0.00 ± 0.00 | 1.8 ± 1.2 | 2.3 ± 0.5 | 0.0 ± 0.2 | 100% (n=18) | 0% (n=1) | 0.030 ± 0.015 |
| claude-sonnet-5 | 0 | B | 24 | 0 | 0 | **0.00 ± 0.00** | 0.00 ± 0.00 | 0.00 ± 0.00 | 0.00 ± 0.00 | 1.7 ± 1.2 | 2.3 ± 0.5 | 0.0 ± 0.0 | 100% (n=18) | — | 0.025 ± 0.011 |
| claude-sonnet-5 | 20 | A | 24 | 0 | 0 | **0.00 ± 0.00** | 0.00 ± 0.00 | 0.00 ± 0.00 | 0.00 ± 0.00 | 1.6 ± 0.9 | 2.3 ± 0.5 | 0.3 ± 0.6 | 100% (n=18) | 50% (n=6) | 0.027 ± 0.016 |
| claude-sonnet-5 | 20 | B | 24 | 0 | 0 | **0.00 ± 0.00** | 0.00 ± 0.00 | 0.00 ± 0.00 | 0.00 ± 0.00 | 2.0 ± 1.9 | 2.4 ± 0.6 | 0.8 ± 0.9 | 100% (n=18) | 92% (n=12) | 0.028 ± 0.021 |

## Por tarefa (chamadas ruins, média sobre execuções)

| tarefa | 0/A | 0/B | 20/A | 20/B |
|---|---|---|---|---|
| comparar-selic-ipca-cambio-2023 | 0.0 ± 0.0 | 0.0 ± 0.0 | 0.0 ± 0.0 | 0.0 ± 0.0 |
| correlacao-selic-dolar-2022 | 0.0 ± 0.0 | 0.0 ± 0.0 | 0.0 ± 0.0 | 0.0 ± 0.0 |
| deflacionar-dolar-2019-2023 | 0.0 ± 0.0 | 0.0 ± 0.0 | 0.0 ± 0.0 | 0.0 ± 0.0 |
| dolar-ptax-ultimo-dia-2023 | 0.0 ± 0.0 | 0.0 ± 0.0 | 0.0 ± 0.0 | 0.0 ± 0.0 |
| focus-ipca-2025-em-dez-2024 | 0.0 ± 0.0 | 0.0 ± 0.0 | 0.0 ± 0.0 | 0.0 ± 0.0 |
| focus-selic-reuniao-r1-2025 | 0.0 ± 0.0 | 0.0 ± 0.0 | 0.0 ± 0.0 | 0.0 ± 0.0 |
| igpm-por-nome-2023 | 0.0 ± 0.0 | 0.0 ± 0.0 | 0.0 ± 0.0 | 0.0 ± 0.0 |
| ipca-acumulado-2023 | 0.0 ± 0.0 | 0.0 ± 0.0 | 0.0 ± 0.0 | 0.0 ± 0.0 |
| metadados-serie-4390 | 0.0 ± 0.0 | 0.0 ± 0.0 | 0.0 ± 0.0 | 0.0 ± 0.0 |
| ptax-simbolo-errado | 0.0 ± 0.0 | 0.0 ± 0.0 | 0.0 ± 0.0 | 0.0 ± 0.0 |
| selic-meta-fim-2023 | 0.0 ± 0.0 | 0.0 ± 0.0 | 0.0 ± 0.0 | 0.0 ± 0.0 |
| serie-inexistente-99999 | 0.0 ± 0.0 | 0.0 ± 0.0 | 0.0 ± 0.0 | 0.0 ± 0.0 |

