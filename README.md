# NP Checklist Estética — versão ONLINE

Conectado ao projeto Supabase separado `NP Checklist Estetica`.

Não há login de funcionário: o responsável é informado no próprio checklist.

## Atenção
A `Publishable key` usada no `config.js` é própria para uso no navegador. Não coloque uma Secret/Service Role key no frontend.

## Hospedagem
O conteúdo desta pasta pode ser publicado em um serviço de hospedagem estática, como GitHub Pages, Vercel ou Netlify. O banco e os arquivos ficam no Supabase.

## Estrutura
- checklists: OS, cliente, veículo, funcionário, assinatura etc.
- checklist_photos: fotos
- checklist_marks: avarias
- storage bucket: checklist-files

## Atualização 2026-09-28
- Adicionado botão **Exportar PDF** na visualização da OS. Ele abre a impressão do navegador já preparada para salvar em PDF.
- Ao editar uma OS, se a atualização principal dos dados for concluída, erros auxiliares de arquivos não interrompem a tela nem exibem a mensagem de erro ao usuário.
