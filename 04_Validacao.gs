function cpf_(input){const s=String(input||'').replace(/\D/g,'');
if(!/^\d{11}$/.test(s)||/^(\d)\1+$/.test(s))fail_('CPF inválido.');
for(let j=9;
j<11;
j++){let n=0;
for(let i=0;
i<j;
i++)n+=Number(s[i])*(j+1-i);
let d=(n*10)%11;
if(d===10)d=0;
if(d!==Number(s[j]))fail_('CPF inválido.');
}return s;
}
function date_(s){if(!/^\d{2}\/\d{2}\/\d{4}$/.test(s||''))fail_('Data deve usar DD/MM/AAAA.');
const [d,m,y]=s.split('/').map(Number);
const date=new Date(Date.UTC(y,m-1,d));
if(date.getUTCFullYear()!==y||date.getUTCMonth()!==m-1||date.getUTCDate()!==d)fail_('Data inválida.');
return date;
}
function today_(){return date_(Utilities.formatDate(new Date(),PDA.tz,'dd/MM/yyyy'));
}
function validatePerson_(input,c,complete){const p={};
SCHEMA.Pessoas.forEach(k=>p[k]=typeof input[k]==='string'?input[k].trim():input[k]);
p.cpf=cpf_(p.cpf);
required_(p.nome,'nome completo');
if(p.nome.length>200)fail_('Nome muito longo.');
if(complete)['nascimento','telefone','tipoVia','via','numero','bairro','cidade','uf','entidade','analfabeto'].forEach(k=>required_(p[k],k));
if(p.nascimento&&date_(p.nascimento)>today_())fail_('Nascimento não pode estar no futuro.');
if(p.telefone&&!/^\d{10,11}$/.test(p.telefone.replace(/\D/g,'')))fail_('Telefone deve conter DDD e 10 ou 11 dígitos.');
if(p.uf&&!/^(AC|AL|AP|AM|BA|CE|DF|ES|GO|MA|MT|MS|MG|PA|PB|PR|PE|PI|RJ|RN|RS|RO|RR|SC|SP|SE|TO)$/.test(p.uf))fail_('UF inválida.');
if(p.cidade&&!c.municipios.includes(p.cidade))fail_('Município não cadastrado.');
if(p.entidade&&!c.entidades.includes(p.entidade))fail_('Entidade não cadastrada.');
if(p.entidade==='Outro')required_(p.outraEntidade,'outra entidade');
if(p.analfabeto&&!['SIM','NAO'].includes(p.analfabeto))fail_('Informe a condição registrada no documento de identidade.');
return p;
}
function validateAtend_(input,c){const a={};
['pessoaId','demanda','referencia','parcelas','outrosCasos','observacoes','responsavel','enderecamento','secaoJudiciaria','valorCausa','localData'].forEach(k=>a[k]=String(input[k]||'').trim());
['pessoaId','demanda','referencia','parcelas'].forEach(k=>required_(a[k],k));
if(!c.demandas.includes(a.demanda))fail_('Demanda não cadastrada.');
if(!['Todas de 2025','Somente a última de 2025','Outros casos'].includes(a.parcelas))fail_('Opção de parcelas inválida.');
if(a.parcelas==='Outros casos')required_(a.outrosCasos,'descrição dos outros casos');
if(a.responsavel&&!all_('Usuarios').some(u=>u.email===a.responsavel&&bool_(u.ativo)))fail_('Responsável não autorizado.');
return a;
}
function address_(p){return [p.tipoVia+' '+p.via,p.numero,p.complemento,p.bairro].filter(Boolean).join(', ');
}
function eligibility_(a,manual){const errors=[];
const p=get_('Pessoas',a.pessoaId),c=cfg_();
try{validatePerson_(p,c,true);
validateAtend_(a,c);
}catch(e){errors.push(e.message);
}if(c.vencimentoFuturo==='PENDENTE')errors.push('Definir política de vencimento futuro.');
if(!c.anexoOrientacao)errors.push('Identificar o anexo exigido.');
const docs=all_('Documentos').filter(d=>d.atendimentoId===a.id&&bool_(d.vigente));
c.categorias.forEach(cat=>{const ds=docs.filter(d=>d.categoria===cat);
if(!ds.length)errors.push('Anexar '+cat);
ds.forEach(d=>{if(manual&&!bool_(d.conferido))errors.push('Conferir '+d.nome);
if(cat==='RESIDENCIA'){try{const days=(today_()-date_(d.vencimento))/86400000;
if(days>60)errors.push('Comprovante vencido há mais de 60 dias.');
if(days<0&&c.vencimentoFuturo!=='ACEITAR')errors.push('Vencimento futuro não autorizado.');
}catch(e){errors.push('Residência: '+e.message);
}if(manual&&bool_(d.terceiro)&&!bool_(d.declaracaoTerceiro))errors.push('Conferir declaração de residência na própria fatura.');
}if(manual&&cat==='PROCESSO_ADMINISTRATIVO'&&(!bool_(d.processoCompleto)||!bool_(d.anexoPresente)))errors.push('Conferir processo completo e anexo.');
if(manual&&cat==='PROCURACAO'&&p.analfabeto==='SIM'&&(!bool_(d.rogo)||!bool_(d.testemunhas)))errors.push('Conferir assinatura a rogo e duas testemunhas.');
});
});
if(all_('Pendencias').some(x=>x.atendimentoId===a.id&&x.situacao!=='RESOLVIDA'))errors.push('Existem pendências abertas.');
return [...new Set(errors)];
}
