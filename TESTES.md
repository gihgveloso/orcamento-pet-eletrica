# Testes manuais antes do minicurso

Faça em **um celular Android (Chrome)**, **um iPhone (Safari)** e **um computador**, já com o site publicado no GitHub Pages.

## Primeiro acesso
- [ ] A tela de boas-vindas aparece, com o aviso de que os dados ficam no aparelho.
- [ ] Digitar a renda (ex.: `1.500,00`) atualiza os valores em R$ de cada categoria.
- [ ] Mudar um percentual mostra "Faltam X%" ou "Passou X%"; "Começar a usar" só funciona com 100%.
- [ ] "Voltar à sugestão" restaura 25/5/40/10/10/10.
- [ ] Renda vazia ou zero mostra erro.

## Lançamentos
- [ ] No celular, o campo Valor abre teclado numérico.
- [ ] Salvar sem valor, sem categoria ou com data inválida mostra mensagem de erro.
- [ ] Salvar um gasto mostra o aviso com quanto resta na categoria.
- [ ] "Repetir último" preenche o formulário; ajuste e salve.
- [ ] Liberdade financeira mostra a escolha Investimento / Reserva de emergência.
- [ ] Lançar "Entrada de renda" atualiza "Renda recebida" e o saldo.
- [ ] Digitar `<b>teste</b>` como nome aparece como texto, sem negrito.

## Lista
- [ ] Busca por nome funciona (com e sem acento: "agua" acha "Água").
- [ ] Filtro por categoria funciona.
- [ ] Editar altera o lançamento; mudar a data para outro mês o move para lá.
- [ ] Excluir mostra "Desfazer", e desfazer devolve o item.

## Painel e gráficos
- [ ] Barras mudam de verde para amarelo acima de 80% e para vermelho listrado acima de 100%.
- [ ] Os selos (✓ Dentro, ! Perto do limite, ✕ Estourou) aparecem com texto, não só cor.
- [ ] O resumo do mês traz frases coerentes com os números.
- [ ] Rosca e barras mostram os mesmos valores do painel.

## Virada de mês
- [ ] Avançar para o mês seguinte já traz renda prevista e percentuais do mês atual.
- [ ] Gastos marcados "Repete todo mês" aparecem como sugestão; "Adicionar" e "Agora não" funcionam.
- [ ] "Ir para hoje" volta ao mês atual.
- [ ] Mudar o orçamento de um mês não altera meses já salvos.

## Dados
- [ ] "Carregar exemplo" preenche este mês e o anterior; "Apagar dados de exemplo" remove só eles.
- [ ] Exportar backup baixa um `.json`.
- [ ] Zerar dados pede duas confirmações (a segunda exige digitar ZERAR).
- [ ] Importar o `.json` exportado devolve tudo como estava.
- [ ] Importar um arquivo qualquer (ex.: uma foto renomeada para .json) mostra erro e não apaga nada.
- [ ] Exportar CSV abre certo no Excel e no Google Planilhas (acentos e valores com vírgula).
- [ ] Fechar e reabrir o navegador mantém os dados.
- [ ] Em aba anônima, o app abre e avisa se não puder salvar.

## Offline e instalação
- [ ] Abrir o site uma vez, ativar modo avião e recarregar: o app abre normalmente.
- [ ] Android: menu > "Instalar app"/"Adicionar à tela inicial". O ícone aparece e abre em tela cheia.
- [ ] iPhone: Compartilhar > "Adicionar à Tela de Início".

## Acessibilidade e apresentação
- [ ] Navegar só com Tab/Enter no computador: o foco dourado é sempre visível.
- [ ] "Modo apresentação" aumenta tudo; conferir legibilidade no projetor do auditório do 1E, do fundo da sala.
- [ ] Zoom de 200% no navegador não quebra o layout.
- [ ] Conferir a tela em celular pequeno (≈360 px de largura) e no desktop.

## No dia
- [ ] Deixar o link (e um QR code) no slide de abertura.
- [ ] Ter um aparelho com o exemplo carregado para demonstrar.
- [ ] Lembrar a turma de exportar o backup ao final.
