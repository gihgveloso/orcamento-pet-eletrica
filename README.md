# Orçamento PET Elétrica

Controle de orçamento pessoal do minicurso de Planejamento Financeiro do PET Elétrica (UFU).
Site 100% estático (HTML, CSS e JavaScript puro), sem cadastro e sem backend. Os dados de cada pessoa ficam só no `localStorage` do navegador dela.

## Arquivos
| Arquivo | Para que serve |
|---|---|
| `index.html` | Estrutura da página |
| `style.css` | Visual (cores no topo, em `:root`) |
| `app.js` | Toda a lógica, em seções numeradas e comentadas |
| `sw.js` | Service worker (funciona offline) |
| `manifest.webmanifest` | Permite instalar como app no celular |
| `icons/` | Favicon e ícones do app |

## Publicar no GitHub Pages
1. Crie um repositório e envie estes arquivos para a **raiz** do branch `main` (veja "Como enviar os arquivos" abaixo).
2. No GitHub: **Settings > Pages > Build and deployment > Deploy from a branch**.
3. Escolha **main** e **/ (root)** e clique em **Save**.
4. Em 1 a 2 minutos o site fica em `https://SEU-USUARIO.github.io/NOME-DO-REPOSITORIO/`.

Todos os caminhos são relativos, então funciona em subpasta sem ajustes.

## Como enviar os arquivos
O GitHub não descompacta `.zip`: descompacte antes no computador.

**Pelo site (mais simples)**
1. No repositório, clique em **Add file > Upload files**.
2. Abra a pasta descompactada e selecione **tudo o que está dentro dela** (`index.html`, `app.js`, `style.css`, `sw.js`, `manifest.webmanifest`, `README.md` e a pasta `icons`).
3. **Arraste** a seleção para a área da página. A pasta `icons` só entra arrastando; o botão "choose your files" não aceita pastas.
4. Confira se `icons/` aparece na lista com os 3 arquivos, escreva a mensagem do commit e clique em **Commit changes**.

Não arraste a pasta `orcamento-pet` inteira: os arquivos ficariam numa subpasta e o site não abriria.

**Pelo terminal**
```bash
cd orcamento-pet
git init
git add .
git commit -m "Primeira versão do app de orçamento do minicurso"
git branch -M main
git remote add origin https://github.com/SEU-USUARIO/orcamento-pet-eletrica.git
git push -u origin main
```

## Testar localmente
O service worker não funciona abrindo o arquivo direto (`file://`). Use um servidor simples na pasta do projeto:

```bash
python -m http.server 8000
```
Depois abra `http://localhost:8000`. Para testar no celular na mesma rede Wi-Fi, use o IP do computador (ex.: `http://192.168.0.10:8000`); a instalação como app e o modo offline completos só funcionam em HTTPS (ou seja, no GitHub Pages).

## Atualizar o site
1. Edite os arquivos e faça commit/push no `main`.
2. **Importante:** em `sw.js`, aumente a versão do cache (`orcamento-pet-v1` → `orcamento-pet-v2`). Sem isso, quem já abriu o site pode continuar vendo a versão antiga.
3. Os usuários recebem a versão nova ao reabrir o app (às vezes é preciso abrir duas vezes).

Os dados das pessoas não são afetados por atualizações. Se mudar o formato dos dados, aumente `DATA_VERSION` em `app.js` e escreva a conversão na função `migrate()`.

## Onde mexer
- Categorias, percentuais sugeridos, descrições e exemplos: constante `CATS` no início de `app.js`.
- Cores: variáveis no topo do `style.css`. Há um bloco para o tema claro (`:root`) e outro para o escuro (`:root[data-theme="dark"]`); a cor de cada categoria é `--cat-...` nos dois.
- Dados de demonstração: função `loadExample()` em `app.js`.
