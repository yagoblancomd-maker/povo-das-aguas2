BEGIN;

CREATE TABLE IF NOT EXISTS agenda_eventos(
 id text PRIMARY KEY,
 versao integer NOT NULL DEFAULT 1,
 criado_em timestamptz NOT NULL DEFAULT now(),
 alterado_em timestamptz NOT NULL DEFAULT now(),
 usuario_email text,
 titulo text NOT NULL,
 descricao text,
 inicio timestamptz NOT NULL,
 fim timestamptz,
 dia_inteiro boolean NOT NULL DEFAULT false,
 tipo text NOT NULL DEFAULT 'COMPROMISSO',
 fonte text NOT NULL DEFAULT 'MANUAL',
 local text,
 pessoa_id text REFERENCES pessoas(id) ON DELETE SET NULL,
 processo_id text REFERENCES processos(id) ON DELETE SET NULL,
 tarefa_id text REFERENCES tarefas(id) ON DELETE SET NULL,
 visibilidade text NOT NULL DEFAULT 'EQUIPE',
 responsavel text,
 participantes jsonb NOT NULL DEFAULT '[]'::jsonb,
 cor text,
 recorrencia text,
 entidade text,
 ativo boolean NOT NULL DEFAULT true
);
CREATE INDEX IF NOT EXISTS agenda_eventos_inicio_idx ON agenda_eventos(inicio);
CREATE INDEX IF NOT EXISTS agenda_eventos_tipo_idx ON agenda_eventos(tipo);
CREATE INDEX IF NOT EXISTS agenda_eventos_responsavel_idx ON agenda_eventos(lower(responsavel));

CREATE TABLE IF NOT EXISTS pessoa_observacoes(
 id text PRIMARY KEY,
 versao integer NOT NULL DEFAULT 1,
 criado_em timestamptz NOT NULL DEFAULT now(),
 alterado_em timestamptz NOT NULL DEFAULT now(),
 usuario_email text,
 pessoa_id text NOT NULL REFERENCES pessoas(id) ON DELETE CASCADE,
 autor text NOT NULL,
 conteudo text NOT NULL,
 tipo text NOT NULL DEFAULT 'ATENDIMENTO',
 fixada boolean NOT NULL DEFAULT false,
 visibilidade text NOT NULL DEFAULT 'INTERNA',
 ativo boolean NOT NULL DEFAULT true
);
CREATE INDEX IF NOT EXISTS pessoa_observacoes_pessoa_idx ON pessoa_observacoes(pessoa_id,fixada DESC,criado_em DESC);

CREATE TABLE IF NOT EXISTS chat_canais(
 id text PRIMARY KEY,
 versao integer NOT NULL DEFAULT 1,
 criado_em timestamptz NOT NULL DEFAULT now(),
 alterado_em timestamptz NOT NULL DEFAULT now(),
 usuario_email text,
 nome text NOT NULL,
 tipo text NOT NULL DEFAULT 'GRUPO',
 criado_por text,
 pessoa_id text REFERENCES pessoas(id) ON DELETE SET NULL,
 processo_id text REFERENCES processos(id) ON DELETE SET NULL,
 tarefa_id text REFERENCES tarefas(id) ON DELETE SET NULL,
 visibilidade text NOT NULL DEFAULT 'MEMBROS',
 entidade text,
 ativo boolean NOT NULL DEFAULT true
);

CREATE TABLE IF NOT EXISTS chat_membros(
 id text PRIMARY KEY,
 versao integer NOT NULL DEFAULT 1,
 criado_em timestamptz NOT NULL DEFAULT now(),
 alterado_em timestamptz NOT NULL DEFAULT now(),
 usuario_email text,
 canal_id text NOT NULL REFERENCES chat_canais(id) ON DELETE CASCADE,
 usuario text NOT NULL,
 papel text NOT NULL DEFAULT 'MEMBRO',
 ultimo_visto_em timestamptz,
 silenciado boolean NOT NULL DEFAULT false,
 ativo boolean NOT NULL DEFAULT true
);
CREATE UNIQUE INDEX IF NOT EXISTS chat_membros_user_channel_uidx
 ON chat_membros(lower(usuario),canal_id) WHERE ativo=true;

CREATE TABLE IF NOT EXISTS chat_mensagens(
 id text PRIMARY KEY,
 versao integer NOT NULL DEFAULT 1,
 criado_em timestamptz NOT NULL DEFAULT now(),
 alterado_em timestamptz NOT NULL DEFAULT now(),
 usuario_email text,
 canal_id text NOT NULL REFERENCES chat_canais(id) ON DELETE CASCADE,
 autor text NOT NULL,
 conteudo text NOT NULL,
 formato text NOT NULL DEFAULT 'HTML',
 resposta_id text,
 editada_em timestamptz,
 excluida boolean NOT NULL DEFAULT false
);
CREATE INDEX IF NOT EXISTS chat_mensagens_canal_idx ON chat_mensagens(canal_id,criado_em);

CREATE TABLE IF NOT EXISTS mensagens_modelos(
 id text PRIMARY KEY,
 versao integer NOT NULL DEFAULT 1,
 criado_em timestamptz NOT NULL DEFAULT now(),
 alterado_em timestamptz NOT NULL DEFAULT now(),
 usuario_email text,
 titulo text NOT NULL,
 categoria text,
 conteudo text NOT NULL,
 ativo boolean NOT NULL DEFAULT true,
 canal text NOT NULL DEFAULT 'WHATSAPP',
 criado_por text,
 escopo text NOT NULL DEFAULT 'EQUIPE',
 placeholders jsonb NOT NULL DEFAULT '[]'::jsonb
);
CREATE INDEX IF NOT EXISTS mensagens_modelos_categoria_idx ON mensagens_modelos(categoria,ativo);

CREATE TABLE IF NOT EXISTS usuario_preferencias(
 id text PRIMARY KEY,
 versao integer NOT NULL DEFAULT 1,
 criado_em timestamptz NOT NULL DEFAULT now(),
 alterado_em timestamptz NOT NULL DEFAULT now(),
 usuario_email text,
 usuario text NOT NULL,
 fonte text NOT NULL DEFAULT 'PADRAO',
 tamanho text NOT NULL DEFAULT 'NORMAL',
 tema text NOT NULL DEFAULT 'CLARO',
 densidade text NOT NULL DEFAULT 'CONFORTAVEL',
 cor_destaque text NOT NULL DEFAULT 'MAR',
 movimento_reduzido boolean NOT NULL DEFAULT false
);
CREATE UNIQUE INDEX IF NOT EXISTS usuario_preferencias_usuario_uidx
 ON usuario_preferencias(lower(usuario));

ALTER TABLE tarefas ADD COLUMN IF NOT EXISTS prazo_tipo text;
ALTER TABLE tarefas ADD COLUMN IF NOT EXISTS prazo_quantidade integer;
ALTER TABLE tarefas ADD COLUMN IF NOT EXISTS prazo_contagem text;
ALTER TABLE tarefas ADD COLUMN IF NOT EXISTS prazo_inicio text;

INSERT INTO mensagens_modelos(
 id,titulo,categoria,conteudo,ativo,canal,criado_por,escopo,placeholders
) VALUES
(
 'MSG_PAD_DOCUMENTOS',
 'Solicitação de documentos',
 'DOCUMENTOS',
 '<p>Olá, <<NOME>>.</p><p>Para prosseguirmos com seu atendimento no Povo das Águas, precisamos que encaminhe os documentos solicitados pela equipe.</p><p>Em caso de dúvida, responda esta mensagem.</p>',
 true,'WHATSAPP','SISTEMA','EQUIPE','["NOME","CPF","RESPONSAVEL"]'::jsonb
),
(
 'MSG_PAD_PROCESSO',
 'Processo distribuído',
 'PROCESSO',
 '<p>Olá, <<NOME>>.</p><p>Informamos que sua ação foi distribuída sob o número <<PROCESSO>>.</p><p>A equipe do Povo das Águas continuará acompanhando a tramitação.</p>',
 true,'WHATSAPP','SISTEMA','EQUIPE','["NOME","PROCESSO","RESPONSAVEL"]'::jsonb
),
(
 'MSG_PAD_RETORNO',
 'Retorno de atendimento',
 'ATENDIMENTO',
 '<p>Olá, <<NOME>>.</p><p>Estamos entrando em contato para dar continuidade ao seu atendimento pelo Povo das Águas.</p><p>Responsável: <<RESPONSAVEL>>.</p>',
 true,'WHATSAPP','SISTEMA','EQUIPE','["NOME","RESPONSAVEL"]'::jsonb
)
ON CONFLICT(id) DO NOTHING;

COMMIT;
