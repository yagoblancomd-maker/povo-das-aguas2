BEGIN;

ALTER TABLE pessoas ADD COLUMN IF NOT EXISTS origem_cadastro text;

ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS entidade text;
CREATE UNIQUE INDEX IF NOT EXISTS usuarios_nome_usuario_uidx
  ON usuarios(lower(nome_usuario))
  WHERE nome_usuario IS NOT NULL AND nome_usuario<>'';

ALTER TABLE tarefas ADD COLUMN IF NOT EXISTS titulo text;
ALTER TABLE tarefas ADD COLUMN IF NOT EXISTS descricao text;
ALTER TABLE tarefas ADD COLUMN IF NOT EXISTS criado_por text;
ALTER TABLE tarefas ADD COLUMN IF NOT EXISTS prazo text;
ALTER TABLE tarefas ADD COLUMN IF NOT EXISTS prioridade text;
ALTER TABLE tarefas ADD COLUMN IF NOT EXISTS tags jsonb DEFAULT '[]'::jsonb;
ALTER TABLE tarefas ADD COLUMN IF NOT EXISTS modo_distribuicao text;
ALTER TABLE tarefas ADD COLUMN IF NOT EXISTS origem text;

CREATE TABLE IF NOT EXISTS tarefa_mensagens(
 id text PRIMARY KEY,versao integer NOT NULL DEFAULT 1,criado_em timestamptz NOT NULL DEFAULT now(),
 alterado_em timestamptz NOT NULL DEFAULT now(),usuario_email text,
 tarefa_id text REFERENCES tarefas(id) ON DELETE CASCADE,autor text,mensagem text
);
CREATE INDEX IF NOT EXISTS tarefa_mensagens_tarefa_idx ON tarefa_mensagens(tarefa_id,criado_em);

CREATE TABLE IF NOT EXISTS tarefa_anexos(
 id text PRIMARY KEY,versao integer NOT NULL DEFAULT 1,criado_em timestamptz NOT NULL DEFAULT now(),
 alterado_em timestamptz NOT NULL DEFAULT now(),usuario_email text,
 tarefa_id text REFERENCES tarefas(id) ON DELETE CASCADE,file_id text,url text,nome text,mime text,hash text,
 bytes bigint,enviado_por text,pessoa_id text,documento_id text
);
CREATE INDEX IF NOT EXISTS tarefa_anexos_tarefa_idx ON tarefa_anexos(tarefa_id,criado_em);

CREATE TABLE IF NOT EXISTS tarefa_leituras(
 id text PRIMARY KEY,versao integer NOT NULL DEFAULT 1,criado_em timestamptz NOT NULL DEFAULT now(),
 alterado_em timestamptz NOT NULL DEFAULT now(),usuario_email text,
 usuario text,ultimo_visto_em timestamptz,tarefa_id text REFERENCES tarefas(id) ON DELETE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS tarefa_leituras_user_task_uidx ON tarefa_leituras(lower(usuario),tarefa_id);

CREATE TABLE IF NOT EXISTS tarefa_tags(
 id text PRIMARY KEY,versao integer NOT NULL DEFAULT 1,criado_em timestamptz NOT NULL DEFAULT now(),
 alterado_em timestamptz NOT NULL DEFAULT now(),usuario_email text,
 nome text NOT NULL,cor text,ativo boolean NOT NULL DEFAULT true
);
CREATE UNIQUE INDEX IF NOT EXISTS tarefa_tags_nome_uidx ON tarefa_tags(lower(nome));

ALTER TABLE processos ADD COLUMN IF NOT EXISTS datajud_tribunal text;
ALTER TABLE processos ADD COLUMN IF NOT EXISTS datajud_grau text;
ALTER TABLE processos ADD COLUMN IF NOT EXISTS datajud_classe text;
ALTER TABLE processos ADD COLUMN IF NOT EXISTS datajud_orgao text;
ALTER TABLE processos ADD COLUMN IF NOT EXISTS datajud_sistema text;
ALTER TABLE processos ADD COLUMN IF NOT EXISTS datajud_data_ajuizamento text;
ALTER TABLE processos ADD COLUMN IF NOT EXISTS datajud_nivel_sigilo text;
ALTER TABLE processos ADD COLUMN IF NOT EXISTS datajud_assuntos jsonb DEFAULT '[]'::jsonb;
ALTER TABLE processos ADD COLUMN IF NOT EXISTS datajud_tags jsonb DEFAULT '[]'::jsonb;
ALTER TABLE processos ADD COLUMN IF NOT EXISTS datajud_marco_atual text;
ALTER TABLE processos ADD COLUMN IF NOT EXISTS datajud_ultima_movimentacao text;
ALTER TABLE processos ADD COLUMN IF NOT EXISTS datajud_ultima_atualizacao_origem text;
ALTER TABLE processos ADD COLUMN IF NOT EXISTS datajud_ultima_consulta text;
ALTER TABLE processos ADD COLUMN IF NOT EXISTS datajud_status text;
ALTER TABLE processos ADD COLUMN IF NOT EXISTS datajud_erro text;

CREATE INDEX IF NOT EXISTS processos_datajud_tribunal_idx ON processos(datajud_tribunal);
CREATE INDEX IF NOT EXISTS processos_datajud_classe_idx ON processos(datajud_classe);
CREATE INDEX IF NOT EXISTS processos_datajud_orgao_idx ON processos(datajud_orgao);
CREATE INDEX IF NOT EXISTS processos_datajud_status_idx ON processos(datajud_status);
CREATE INDEX IF NOT EXISTS processos_datajud_marco_idx ON processos(datajud_marco_atual);
CREATE INDEX IF NOT EXISTS processos_datajud_ultima_mov_idx ON processos(datajud_ultima_movimentacao);

COMMIT;
