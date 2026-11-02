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
1. Crie um repositório e envie estes arquivos para a **raiz** do branch `main`.
2. No GitHub: **Settings > Pages > Build and deployment > Deploy from a branch**.
3. Escolha **main** e **/ (root)** e clique em **Save**.
4. Em 1 a 2 minutos o site fica em `https://SEU-USUARIO.github.io/NOME-DO-REPOSITORIO/`.

Todos os caminhos são relativos, então funciona em subpasta sem ajustes.

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
- Cores: variáveis em `:root` no `style.css`.
- Dados de demonstração: função `loadExample()` em `app.js`.
