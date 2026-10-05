const PLACEHOLDERS=['ENDERECAMENTO','SECAO_JUDICIARIA','NOME_COMPLETO','CPF','ENDERECO','CIDADE_UF','TELEFONE','VALOR_CAUSA','LOCAL_DATA'];
function docParts_(doc){const parts=[];
function visit(t){if(t.getType()===DocumentApp.TabType.DOCUMENT_TAB){const d=t.asDocumentTab();
parts.push(d.getBody());
if(d.getHeader())parts.push(d.getHeader());
if(d.getFooter())parts.push(d.getFooter());
}t.getChildTabs().forEach(visit);
}doc.getTabs().forEach(visit);
return parts;
}
function tokens_(parts){return parts.flatMap(p=>p.getText().match(/<<[^<>]+>>/g)||[]);
}
function validateTemplate_(id){required_(id,'modelo Google Docs');
const tokens=tokens_(docParts_(DocumentApp.openById(id)));
const missing=PLACEHOLDERS.filter(k=>!tokens.includes('<<'+k+'>>'));
const unknown=tokens.filter(t=>!PLACEHOLDERS.includes(t.slice(2,-2)));
if(missing.length||unknown.length)fail_('Modelo incompatível. Ausentes: '+missing.join(', ')+'; desconhecidos: '+unknown.join(', '));
}
function values_(a,p){const map={ENDERECAMENTO:a.enderecamento,SECAO_JUDICIARIA:a.secaoJudiciaria,NOME_COMPLETO:p.nome,CPF:p.cpf.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/,'$1.$2.$3-$4'),ENDERECO:address_(p),CIDADE_UF:p.cidade+'/'+p.uf,TELEFONE:p.telefone,VALOR_CAUSA:a.valorCausa,LOCAL_DATA:a.localData};
Object.keys(map).forEach(k=>{required_(map[k],k);
if(/<<|>>/.test(map[k]))fail_('Campo contém marcador não resolvido: '+k);
});
if(!/^\d{1,3}(\.\d{3})*,\d{2}$|^\d+,\d{2}$/.test(map.VALOR_CAUSA))fail_('Valor da causa: use 6.518,00, sem R$.');
return map;
}
function generate_(ctx,q){const a=get_('Atendimentos',q.id);
version_(a,q.versao);
if(a.demanda!=='Seguro-Defeso 2025'||a.parcelas!=='Somente a última de 2025')fail_('Não existe modelo aprovado para esta demanda/opção.');
const errors=eligibility_(a,true);
if(a.situacao!=='CONFERIDO')errors.push('Atendimento deve estar conferido.');
if(errors.length)fail_(errors.join('\n'));
const c=cfg_();
if(!bool_(c.templateAprovado))fail_('Modelo depende de aprovação administrativa após revisão.');
validateTemplate_(c.templateId);
const p=get_('Pessoas',a.pessoaId),map=values_(a,p);
const folder=folder_(a),mid=id_('MIN',ctx.op);
const name='MINUTA_'+a.id+'_'+mid;
const it=folder.getFilesByName(name);
const file=it.hasNext()?it.next():DriveApp.getFileById(c.templateId).makeCopy(name,folder);
if(it.hasNext())fail_('Cópias duplicadas; reconciliação necessária.');
ctx.effects.push('Cópia de minuta no Drive: '+file.getUrl());
const doc=DocumentApp.openById(file.getId());
const parts=docParts_(doc);
Object.keys(map).forEach(key=>parts.forEach(part=>{const token='<<'+key+'>>';
let found=part.findText(token);
while(found){const text=found.getElement().asText(),start=found.getStartOffset(),end=found.getEndOffsetInclusive();
const attrs=text.getAttributes(start);
text.deleteText(start,end);
text.insertText(start,map[key]);
text.setAttributes(start,start+map[key].length-1,attrs);
found=part.findText(token);
}}));
if(tokens_(parts).length)fail_('Minuta incompleta; existem placeholders não preenchidos.');
doc.saveAndClose();
const number=all_('Minutas').filter(m=>m.atendimentoId===a.id).length+1;
return change_(ctx,'Minutas',mid,{atendimentoId:a.id,fileId:file.getId(),url:file.getUrl(),numero:number,situacao:'AGUARDA_REVISAO',snapshot:snapshot_(a,p),templateId:c.templateId,templateModified:String(DriveApp.getFileById(c.templateId).getLastUpdated().getTime())});
}
function reviewMin_(ctx,q){const m=get_('Minutas',q.id);
version_(m,q.versao);
const a=get_('Atendimentos',m.atendimentoId);
if(eligibility_(a,true).length||m.snapshot!==snapshot_(a,get_('Pessoas',a.pessoaId))||m.templateId!==cfg_().templateId||m.templateModified!==String(DriveApp.getFileById(m.templateId).getLastUpdated().getTime()))fail_('Dados ou modelo alterados. Gere nova versão.');
if(tokens_(docParts_(DocumentApp.openById(m.fileId))).length)fail_('Documento contém placeholders.');
return change_(ctx,'Minutas',m.id,Object.assign({},m,{situacao:'REVISADA',revisor:ctx.email,revisadaEm:now_()}),m.versao);
}
