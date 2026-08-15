# NOTICE

## Duas licenças, e elas não são a mesma coisa

O **código** deste servidor é MIT (veja `LICENSE`). Os **dados** que ele serve
não são — são do Banco Central do Brasil e vêm sob uma licença com
*share-alike*. Confundir as duas é o erro que este arquivo existe para evitar.

## Dados do Banco Central do Brasil — ODbL v1.0

> Dados obtidos do Banco Central do Brasil (SGS / Olinda-Expectativas / PTAX),
> disponibilizados sob **Open Data Commons Open Database License (ODbL) v1.0** —
> https://opendatacommons.org/licenses/odbl/1-0/

Verificado contra a origem em **13/08/2026**: os datasets do Portal de Dados
Abertos do BCB declaram `license_id: "odc-odbl"` — 4.259 de 4.260, com 1 sem
licença especificada. **Não é CC0, não é CC BY e não é domínio público.**

O portal declara o texto da licença em
`http://www.opendefinition.org/licenses/odc-odbl`. Esse endereço **resolve**
(medido: HTTP 200), mas só sem TLS; por isso o link canônico acima é o do Open
Data Commons, em HTTPS.

### O que a ODbL exige de quem usa

- **Atribuição** da fonte (o BCB não publica string de atribuição preferida; a
  que este servidor emite está no bloco de proveniência de cada resposta).
- **Share-alike** sobre *bases derivadas* (§4.4): quem publicar uma base
  construída a partir destes dados precisa oferecê-la sob ODbL.
- **Anti-DRM** (§4.7): não impor restrição técnica que impeça terceiros de
  exercer os direitos da licença.

Este servidor opera como *Produced Work* (§4.3): ele consulta a origem a cada
pergunta e **não mantém base derivada de observações**. O único dado persistido
é metadado — o catálogo curado de 139 séries (código, nome, categoria,
periodicidade) — e o índice do portal fica em cache **efêmero em memória**, por
24 horas, também só com metadado.

### O catálogo curado é oferecido sob ODbL

O catálogo curado persistido neste repositório — as 139 séries com código,
nome, categoria e periodicidade (`src/`), 82 delas com o nome transcrito
literalmente do Portal de Dados Abertos do BCB — é uma coleção de metadados
extraída dos dados do Banco Central. Na medida em que ela constitua *base
derivada* no sentido do §4.4 da ODbL, **o catálogo em si é oferecido sob a
ODbL v1.0**, com o share-alike que a licença impõe; isso não altera a licença
MIT do restante do código nem a superfície do servidor. Quem copiar o catálogo
para outro projeto herda essa condição — que já existia, porque os dados são
do BCB; este parágrafo apenas a nomeia (decisão do mantenedor, 15/08/2026).

## Fontes por API

| API | Órgão responsável | Licença |
|:--|:--|:--|
| SGS — Sistema Gerenciador de Séries Temporais | Banco Central do Brasil / Departamento Econômico (Depec) | ODbL v1.0 |
| Expectativas de Mercado (Focus), via Olinda OData | Banco Central do Brasil / Departamento de Estatísticas (Dstat) | ODbL v1.0 |
| PTAX — cotações e boletins de câmbio, via Olinda OData | Banco Central do Brasil / Departamento das Reservas Internacionais (Depin) | ODbL v1.0 |
| Portal de Dados Abertos (índice CKAN) | Banco Central do Brasil | ODbL v1.0 |

## Disclaimer do BCB sobre a PTAX, repassado verbatim

É o único texto tipo-termos-de-uso que o BCB publica, e ele acompanha toda
resposta de câmbio deste servidor:

> "O Banco Central não assume qualquer responsabilidade pela não simultaneidade
> ou falta das informações prestadas, assim como por eventuais erros de paridades
> das moedas. Não assume, também, responsabilidade por qualquer perda ou dano
> oriundo de tais interrupções, atrasos, falhas ou imperfeições, bem como pelo
> uso inadequado das informações."

## Paridades não-USD: dado de terceiro

As paridades das demais moedas contra o dólar americano **não são apuradas pelo
Banco Central**. O próprio BCB registra que elas são "obtidas junto a agências de
informação" — a página indica **Refinitiv** —, e o BCB as redistribui. Este
servidor as qualifica como dado de terceiro em toda resposta, no payload e num
bloco de proveniência separado. Não as anuncie como dado do BCB.

## Base legal da abertura dos dados

Decreto 8.777/2016 (Política de Dados Abertos do Executivo federal), Resolução
CGINDA 3/2017 e Lei 14.129/2021; internamente, Resoluções BCB 37/2020 e 249/2022
(Plano de Dados Abertos 2025–2027).

## Marcas

Referências ao Banco Central do Brasil são textuais e servem para identificar a
fonte dos dados. Este projeto **não é** afiliado, endossado nem certificado pelo
Banco Central do Brasil.
