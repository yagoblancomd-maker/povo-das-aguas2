# Povo das Águas

Sistema modular em Google Apps Script para cadastro, organização de documentos, minutas, distribuição de tarefas e acompanhamento de processos. O código está na raiz do repositório, com o banco em Google Sheets e os documentos em Google Drive.

A autenticação própria utiliza e-mail e senha em uma única implantação executada como proprietário. O autocadastro é imediato, sem confirmação de e-mail, repetição de senha ou aprovação individual. Meu perfil reúne nome, nome de usuário, e-mail, foto e troca de senha. A recuperação funciona por link enviado ao e-mail cadastrado.

As permissões são verificadas no servidor. Professor/Residente recebem seu acesso operacional automaticamente; Colaborador e Aluno mantêm suas permissões específicas. O autocadastro não concede ADMIN. Códigos por função são opcionais e podem ser definidos nas propriedades, sem aprovação posterior.

A instalação e o procedimento de atualização estão em [Instalacao.md](Instalacao.md). Os usuários que já existiam ativam a senha por Esqueci minha senha. [Dados.md](Dados.md) descreve as abas; [Placeholders.md](Placeholders.md) descreve os marcadores das minutas.

`Povo_das_Aguas.json` reúne exatamente os arquivos `.gs`, `.html` e o manifesto, no formato de exportação do Apps Script. `server_js` corresponde a `.gs` e `html` a `.html`. O JSON é destinado a ferramentas de importação compatíveis; não se cola conteúdo HTML em um arquivo `.gs`.

A atualização mantém a regra dos 36 municípios, a jurisdição gravada em Pessoas e a substituição dos marcadores na minuta. Mantém os IDs e os cadastros existentes e faz uma migração aditiva dos cabeçalhos de Usuarios.

Execute `node auth.test.cjs` e `node auth-interface.test.cjs` para as verificações desta atualização. Os testes usam Google Drive, Sheets, envio de e-mail e DOM simulados. Não substituem a verificação na implantação real. Os arquivos antigos `server.test.cjs`, `interface.test.cjs` e `jurisdicoes.test.cjs` são testes legados de versões anteriores e não constituem a suite atual da autenticação.
