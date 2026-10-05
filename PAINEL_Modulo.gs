function dashboard_(){const ats=all_('Atendimentos'),mins=all_('Minutas');
return {pessoas:all_('Pessoas').length,atendimentos:ats.length,pendencias:all_('Pendencias').filter(p=>p.situacao==='ABERTA').length,conferencias:ats.filter(a=>a.situacao!=='CONFERIDO').length,minutas:mins.length,registros:ats.map(a=>Object.assign({},a,{nome:get_('Pessoas',a.pessoaId).nome})),pendenciasRegistros:all_('Pendencias').filter(p=>p.situacao==='ABERTA'),minutasRegistros:mins};
}
