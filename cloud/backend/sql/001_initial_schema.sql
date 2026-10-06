BEGIN;

CREATE TABLE IF NOT EXISTS pessoas(
 id text PRIMARY KEY,versao integer NOT NULL DEFAULT 1,criado_em timestamptz NOT NULL DEFAULT now(),
 alterado_em timestamptz NOT NULL DEFAULT now(),usuario_email text,nome text NOT NULL,cpf text NOT NULL,
 nascimento text,telefone text,tipo_via text,via text,numero text,complemento text,bairro text,cidade text,
 uf text,entidade text,outra_entidade text,analfabeto text,parcelas_nao_recebidas text,jurisdicao text,
 cep text,email text,criado_por text
);
CREATE UNIQUE INDEX IF NOT EXISTS pessoas_cpf_uidx ON pessoas(cpf);
CREATE INDEX IF NOT EXISTS pessoas_nome_idx ON pessoas(lower(nome));
CREATE INDEX IF NOT EXISTS pessoas_jurisdicao_idx ON pessoas(jurisdicao);

CREATE TABLE IF NOT EXISTS atendimentos(
 id text PRIMARY KEY,versao integer NOT NULL DEFAULT 1,criado_em timestamptz DEFAULT now(),alterado_em timestamptz DEFAULT now(),
 usuario_email text,pessoa_id text REFERENCES pessoas(id),demanda text,referencia text,parcelas text,outros_casos text,
 observacoes text,responsavel text,situacao text,folder_id text,revisao text,conferencia text,enderecamento text,
 secao_judiciaria text,valor_causa text,local_data text
);

CREATE TABLE IF NOT EXISTS documentos(
 id text PRIMARY KEY,versao integer NOT NULL DEFAULT 1,criado_em timestamptz DEFAULT now(),alterado_em timestamptz DEFAULT now(),
 usuario_email text,atendimento_id text,categoria text,file_id text,url text,nome text,hash text,mime text,substitui_id text,
 vigente boolean DEFAULT false,vencimento text,terceiro boolean DEFAULT false,conferido boolean DEFAULT false,
 declaracao_terceiro boolean DEFAULT false,processo_completo boolean DEFAULT false,anexo_presente boolean DEFAULT false,
 rogo boolean DEFAULT false,testemunhas boolean DEFAULT false,observacoes text
);
CREATE INDEX IF NOT EXISTS documentos_owner_idx ON documentos(atendimento_id);

CREATE TABLE IF NOT EXISTS pendencias(
 id text PRIMARY KEY,versao integer DEFAULT 1,criado_em timestamptz DEFAULT now(),alterado_em timestamptz DEFAULT now(),
 usuario_email text,atendimento_id text,descricao text,responsavel text,situacao text
);

CREATE TABLE IF NOT EXISTS minutas(
 id text PRIMARY KEY,versao integer DEFAULT 1,criado_em timestamptz DEFAULT now(),alterado_em timestamptz DEFAULT now(),
 usuario_email text,atendimento_id text,file_id text,url text,numero text,situacao text,snapshot text,template_id text,
 template_modified text,revisor text,revisada_em text,pdf_file_id text,pdf_url text
);

CREATE TABLE IF NOT EXISTS historico(
 id text PRIMARY KEY,versao integer DEFAULT 1,criado_em timestamptz DEFAULT now(),alterado_em timestamptz DEFAULT now(),
 usuario_email text,entidade text,registro_id text,antes jsonb,depois jsonb,operacao text
);

CREATE TABLE IF NOT EXISTS configuracoes(
 id text PRIMARY KEY,versao integer DEFAULT 1,criado_em timestamptz DEFAULT now(),alterado_em timestamptz DEFAULT now(),
 usuario_email text,chave text NOT NULL UNIQUE,valor jsonb
);

CREATE TABLE IF NOT EXISTS usuarios(
 id text PRIMARY KEY,versao integer NOT NULL DEFAULT 1,criado_em timestamptz DEFAULT now(),alterado_em timestamptz DEFAULT now(),
 usuario_email text,email text NOT NULL,perfil text,ativo boolean NOT NULL DEFAULT true,nome text,funcao text,permissoes jsonb,
 permissoes_versao integer DEFAULT 0,senha_hash text,senha_salt text,senha_algoritmo text,session_version integer DEFAULT 0,
 ultimo_login timestamptz,nome_usuario text,foto_id text,emails_anteriores jsonb
);
CREATE UNIQUE INDEX IF NOT EXISTS usuarios_email_uidx ON usuarios(lower(email));

CREATE TABLE IF NOT EXISTS sessoes(
 id text PRIMARY KEY,versao integer DEFAULT 1,criado_em timestamptz DEFAULT now(),alterado_em timestamptz DEFAULT now(),
 usuario_email text,usuario_id text NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,token_hash text NOT NULL UNIQUE,
 expira_em timestamptz NOT NULL,session_version integer DEFAULT 0,revogada boolean DEFAULT false
);

CREATE TABLE IF NOT EXISTS recuperacoes(
 id text PRIMARY KEY,versao integer DEFAULT 1,criado_em timestamptz DEFAULT now(),alterado_em timestamptz DEFAULT now(),
 usuario_email text,usuario_id text NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,token_hash text NOT NULL UNIQUE,
 expira_em timestamptz NOT NULL,session_version integer DEFAULT 0,usada boolean DEFAULT false
);

CREATE TABLE IF NOT EXISTS distribuicao(
 id text PRIMARY KEY,versao integer DEFAULT 1,criado_em timestamptz DEFAULT now(),alterado_em timestamptz DEFAULT now(),
 usuario_email text,atendimento_id text,processo_id text,numero text,juizo text,data text,responsavel text,protocolo_id text
);

CREATE TABLE IF NOT EXISTS tarefas(
 id text PRIMARY KEY,versao integer DEFAULT 1,criado_em timestamptz DEFAULT now(),alterado_em timestamptz DEFAULT now(),
 usuario_email text,tipo text,pessoa_id text REFERENCES pessoas(id),responsavel text,situacao text,jurisdicao text,
 valor_causa text,atribuida_em text,concluida_em text,processo_id text,observacoes text
);
CREATE INDEX IF NOT EXISTS tarefas_responsavel_idx ON tarefas(lower(responsavel),situacao);

CREATE TABLE IF NOT EXISTS processos(
 id text PRIMARY KEY,versao integer DEFAULT 1,criado_em timestamptz DEFAULT now(),alterado_em timestamptz DEFAULT now(),
 usuario_email text,pessoa_id text REFERENCES pessoas(id),atendimento_id text,numero text,juizo text,distribuido_em text,
 responsavel text,movimentacoes jsonb
);
CREATE UNIQUE INDEX IF NOT EXISTS processos_numero_uidx ON processos(numero) WHERE numero IS NOT NULL AND numero<>'';

CREATE TABLE IF NOT EXISTS operacoes(
 id text PRIMARY KEY,versao integer DEFAULT 1,criado_em timestamptz DEFAULT now(),alterado_em timestamptz DEFAULT now(),
 usuario_email text,hash text,resultado jsonb
);

COMMIT;
