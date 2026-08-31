# Séries do Banco Central: como consultar o SGS, a Focus e a PTAX sem cair nas armadilhas

*Publicado em 31 de agosto de 2026. Todos os comportamentos e valores descritos
aqui foram medidos ao vivo contra as APIs do Banco Central na data da
publicação; nada é inferido da documentação. As URLs estão ao lado de cada
medição.*

O Banco Central do Brasil publica três coisas diferentes, por três caminhos
diferentes, e quem começa costuma tratar as três como se fossem a mesma:

- o **SGS** (Sistema Gerenciador de Séries Temporais) — milhares de séries
  numeradas: Selic, IPCA, câmbio, crédito, agregados monetários, contas
  externas;
- a **Focus** — a pesquisa semanal de expectativas de mercado, que não é série
  temporal e sim uma matriz de indicador × horizonte × estatística;
- a **PTAX** — as cotações oficiais de fechamento, servidas pela API Olinda.

Este texto é sobre as armadilhas de cada uma. São armadilhas reais: todas as que
estão aqui foram reproduzidas em 31/08/2026, com a requisição e o código de
resposta anotados.

## O SGS: tudo é um número de série

No SGS não se consulta "o IPCA". Consulta-se a **série 433**. Não se consulta "o
dólar"; consulta-se a **série 1**. A Selic meta é a **432**; a Selic efetiva
acumulada no mês é outra; a Selic diária é outra ainda. Achar o código é metade
do trabalho, e é onde a maior parte do tempo se perde.

A consulta em si é simples:

```
GET https://api.bcb.gov.br/dados/serie/bcdata.sgs.433/dados/ultimos/3?formato=json
```

Resposta real, em 31/08/2026 — o IPCA mensal:

```json
[{"data":"01/05/2026","valor":"0.58"},
 {"data":"01/06/2026","valor":"0.16"},
 {"data":"01/07/2026","valor":"0.07"}]
```

E a Selic meta, série 432, na mesma leitura: **14,00**. (Note que o SGS publica a
meta com data à frente, até a próxima reunião do Copom — a leitura de 31/08/2026
devolveu datas de 14 a 16/09/2026. Isso é característica da série, não erro.)

## Três limites da API, medidos

Estes três não estão em lugar nenhum de forma explícita, e cada um derruba um
script na primeira vez.

**1. Janela maior que 10 anos em série diária é recusada com HTTP 406.**

```
GET .../bcdata.sgs.1/dados?formato=json&dataInicial=01/01/2011&dataFinal=31/12/2025
→ HTTP 406 Not Acceptable
```

Uma janela de 3 anos na mesma série passa e devolve 755 observações:

```
GET .../bcdata.sgs.1/dados?formato=json&dataInicial=01/01/2019&dataFinal=31/12/2021
→ HTTP 200, 755 registros
```

**2. Janela aberta também é recusada, e pela mesma razão.** Pedir a série diária
sem data nenhuma parece inofensivo, mas o limite vale sobre a janela *implícita*
— sem `dataFinal`, a API assume hoje, e a série 1 começa em 1984:

```
GET .../bcdata.sgs.1/dados?formato=json
→ HTTP 406 Not Acceptable
```

**3. `ultimos/N` tem teto de 20, em qualquer periodicidade.**

```
GET .../bcdata.sgs.1/dados/ultimos/20?formato=json  → HTTP 200, 20 registros
GET .../bcdata.sgs.1/dados/ultimos/25?formato=json  → HTTP 400 Bad Request
```

Note que o erro é **400**, não uma resposta truncada: acima de 20 a requisição
falha, não devolve 20. Quem precisa de mais tem de trocar a estratégia e buscar
por janela de datas — o que exige inferir a periodicidade da série, porque o SGS
**não tem endpoint de metadados por série** (o caminho `/metadados` responde
404, e unidade de medida não está disponível em fonte nenhuma da API).

Junte os três e o padrão fica claro: para uma série diária de 15 anos, o
caminho é fatiar em janelas de até 10 anos, buscar cada pedaço e fundir em
ordem de data, sem duplicar as emendas. Na prática convém fatiar em **3 anos**,
não nos 10 permitidos: uma janela diária de uma década custa de 10 a 20 segundos
na origem e pode ser cortada por volta dos 30.

## A armadilha que não dá erro: variação de série que já é variação

Esta é a mais cara, porque produz um número.

O IPCA mensal (série 433) **já é uma variação percentual**. Somar doze valores
mensais para obter o acumulado do ano dá um resultado errado, e errado para
menos, porque inflação compõe. O acumulado se obtém por encadeamento:

```
acumulado = [ Π (1 + vᵢ/100) − 1 ] × 100
```

Com os três meses reais acima (0,58, 0,16 e 0,07), a soma dá 0,8100 e o
encadeamento dá 0,8114 — a soma subestima. A diferença é pequena em três meses e
deixa de ser pequena em doze, ou em qualquer período com inflação alta.

A regra prática: **antes de calcular variação, pergunte se a série é de nível ou
de taxa.** Série de nível (o dólar, o saldo de crédito, o PIB) admite variação
entre as pontas. Série que já é variação por período (IPCA, IGP-M, INPC) exige
encadeamento. E o mesmo vale para reamostrar: transformar IPCA mensal em anual
é composição geométrica, não média.

## Focus: o eixo da Selic não é um horizonte

A Focus é servida pela API Olinda, em cerca de 18 recursos OData distintos.
Consolidá-los faz sentido — mas há uma diferença estrutural que não se pode
consolidar sem mentir.

Para a maior parte dos indicadores (IPCA, PIB, câmbio…), a expectativa tem um
**horizonte**: mensal, trimestral, anual, ou inflação acumulada em 12 e 24
meses. Cada resposta traz média, mediana, desvio-padrão, mínimo, máximo e número
de respondentes, e há a variante **Top 5**, com os cinco projetistas de melhor
desempenho recente.

A Selic é diferente: o eixo dela é a **reunião do Copom** (na forma `R1/2026`),
não um horizonte de tempo. Tratar `selic` como se fosse mais um horizonte é o
erro conceitual mais comum aqui, e leva a consultas que não retornam nada sem
explicar por quê.

Outra assimetria que surpreende: **o conjunto de indicadores muda com o
escopo**. São 9 indicadores no escopo mensal e 26 no anual. Não existe "a lista
de indicadores da Focus" — existe a lista *daquele* escopo.

## PTAX: nem toda cotação é apurada pelo Banco Central

O BCB apura a PTAX do dólar. As **paridades entre outras moedas não são
apuradas por ele**: vêm de agência de informação (Refinitiv) e são
redistribuídas pelo Banco Central. A diferença é jurídica e metodológica, não
cosmética — e as respostas do BCB carregam o aviso de responsabilidade dele
próprio, que deve ser repassado literalmente.

Detalhe de implementação que custa uma tarde: no recurso da Selic Top 5, os
nomes de campo vêm em caixa diferente da dos outros doze recursos. Nenhuma
documentação avisa; só aparece quando o parser devolve `undefined`.

## A licença: ODbL, e ela pede coisas

Os dados do Banco Central saem sob **Open Data Commons Open Database License
(ODbL) v1.0**. Isso **não** é CC0, não é CC BY e não é domínio público. A ODbL
tem três obrigações que sobrevivem à redistribuição:

- **atribuição** — creditar a fonte;
- **share-alike sobre bases derivadas** — uma base pública construída a partir
  desta sai sob a mesma licença;
- **cláusula anti-DRM** — não se pode distribuir a base com trava técnica que
  impeça o exercício dos direitos da licença.

Conferido contra a fonte em 13/08/2026: 4.259 dos 4.260 conjuntos do Portal de
Dados Abertos do BCB declaram `license_id: "odc-odbl"`.

Isso muda como se cita. O mínimo honesto, junto de qualquer número: a série, a
data da extração e a licença.

## E onde entra um assistente de IA

Perguntar a um modelo *"qual a Selic hoje?"* devolve um número do treino: pode
estar certo, pode estar três reuniões do Copom atrasado, e não vem com fonte.

Plugar o SGS resolve isso não por conveniência, mas por **procedência**: o valor
vem com a série, o período, a URL canônica que reproduz a consulta, o instante
real da extração e a licença. E as armadilhas acima ficam do lado do servidor —
o fatiamento da janela, o teto de 20, o encadeamento das séries de taxa, os
escopos da Focus, o aviso da PTAX.

É o que o [`bcb-br-mcp`](https://github.com/SidneyBissoli/bcb-br-mcp) faz: 15
ferramentas sobre SGS, Focus e PTAX, com catálogo curado de 135 séries
verificadas contra a origem, para clientes que falam
[MCP](https://modelcontextprotocol.io). Quando ele calcula alguma coisa —
variação, estatística descritiva, série harmonizada — o resultado vem marcado
como derivado, com a convenção usada; o que o BCB publicou sai sempre verbatim.

Com ou sem ferramenta, as duas perguntas que evitam a maioria dos erros são
sempre as mesmas: **esta série é de nível ou de taxa?** e **quem apurou este
número?**

---

*Servidor: [`bcb-br-mcp`](https://github.com/SidneyBissoli/bcb-br-mcp) ·
endpoint hospedado em `https://bcb.sidneybissoli.com/mcp` · pacote npm
[`bcb-br-mcp`](https://www.npmjs.com/package/bcb-br-mcp) · código sob licença
MIT. Dados do Banco Central do Brasil sob ODbL v1.0 —
https://opendatacommons.org/licenses/odbl/1-0/.*
