/**
 * POVO DAS ÁGUAS — ADMINISTRAÇÃO LAZY
 * Etapa 3/4: cada aba consulta apenas o conjunto de dados que utiliza.
 */

function adminUsersData_(){
  return {
    usuarios:all_('Usuarios').map(user=>
      Object.assign(
        {},
        authPublicUser_(user),
        {
          permissoesEfetivas:effectivePermissions_(user)
        }
      )
    ),
    perfis:Object.keys(ROLES),
    perfisDetalhes:Object.fromEntries(
      Object.keys(ROLES).map(perfil=>[
        perfil,
        {
          descricao:ROLE_DESCRIPTIONS[perfil]||'',
          permissoes:rolePermissions_(perfil)
        }
      ])
    ),
    permissoes:Object.entries(PERMISSIONS).map(
      ([key,value])=>({
        key,
        label:value.label,
        descricao:value.descricao
      })
    )
  };
}

function adminTagsData_(){
  return {
    tagsTarefas:taskTagAdminList_()
  };
}

function adminIntegrationsData_(){
  return {
    modelo:templateStatus_(),
    portalTransparencia:portalTransparenciaStatus_(),
    deepseek:deepseekStatus_()
  };
}

function adminConfigData_(){
  return {
    configuracoes:all_('Configuracoes'),
    config:cfg_()
  };
}
