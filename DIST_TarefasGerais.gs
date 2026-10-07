const GENERAL_TASK_TYPE='TAREFA_GERAL';
const GENERAL_TASK_ASSIGNED='ATRIBUIDA';
const GENERAL_TASK_DONE='CONCLUIDA';
const GENERAL_TASK_PRIORITIES=Object.freeze(['BAIXA','NORMAL','ALTA','URGENTE']);
const DEFAULT_TASK_TAGS=Object.freeze([
  {nome:'URGENTE',cor:'#c65349'},
  {nome:'DOCUMENTAÇÃO',cor:'#d49a42'},
  {nome:'PROCESSO',cor:'#176e7d'},
  {nome:'RETORNO',cor:'#7a5aa6'},
  {nome:'FINANCEIRO',cor:'#2f8b65'}
]);

function taskTagsParse_(value){
  if(Array.isArray(value)){
    return [...new Set(value.map(v=>String(v||'').trim()).filter(Boolean))].slice(0,8);
  }
  const text=String(value||'').trim();
  if(!text)return [];
  try{
    const parsed=JSON.parse(text);
    if(Array.isArray(parsed))return taskTagsParse_(parsed);
  }catch(e){}
  return [...new Set(text.split(',').map(v=>v.trim()).filter(Boolean))].slice(0,8);
}

function taskDueState_(task){
  const due=String(task&&task.prazo||'').trim();
  if(!due)return {estado:'SEM_PRAZO',horas:null};
  const end=new Date(due+'T23:59:59');
  const hours=(end.getTime()-Date.now())/3600000;
  if(Number.isNaN(hours))return {estado:'SEM_PRAZO',horas:null};
  if(hours<0)return {estado:'VENCIDA',horas:Math.round(hours)};
  if(hours<=24)return {estado:'ATE_24H',horas:Math.round(hours)};
  if(hours<=96)return {estado:'ATE_96H',horas:Math.round(hours)};
  return {estado:'NORMAL',horas:Math.round(hours)};
}

function generalTaskRows_(name){
  return ss_().getSheetByName(name)
    ?all_(name)
    :[];
}

function ensureGeneralTaskSchema_(){
  const spreadsheet=ss_();
  let changed=false;

  [
    'Tarefas',
    'TarefaMensagens',
    'TarefaAnexos',
    'TarefaLeituras',
    'TarefaTags'
  ].forEach(name=>{
    const expected=
      headers_(name);

    let sheet=
      spreadsheet.getSheetByName(name);

    if(!sheet){
      sheet=spreadsheet.insertSheet(name);
      changed=true;
    }

    const lastColumn=
      sheet.getLastColumn();

    if(lastColumn===0){
      sheet
        .getRange(
          1,
          1,
          1,
          expected.length
        )
        .setValues([expected]);

      sheet.setFrozenRows(1);

      sheet
        .getRange(
          1,
          1,
          1,
          expected.length
        )
        .setBackground('#12364a')
        .setFontColor('#ffffff');

      sheet
        .getRange(
          1,
          1,
          sheet.getMaxRows(),
          expected.length
        )
        .setNumberFormat('@');

      changed=true;
      return;
    }

    const current=
      sheet
        .getRange(
          1,
          1,
          1,
          lastColumn
        )
        .getDisplayValues()[0]
        .map(value=>
          String(value||'').trim()
        );

    if(
      JSON.stringify(current)===
      JSON.stringify(expected)
    ){
      return;
    }

    const compatible=
      current.length<expected.length&&
      current.every(
        (value,index)=>
          value===expected[index]
      );

    if(!compatible){
      fail_(
        'Cabeçalhos alterados: '+
        name+
        '. A migração automática de tarefas só acrescenta colunas ao final.'
      );
    }

    const missing=
      expected.slice(
        current.length
      );

    sheet
      .getRange(
        1,
        current.length+1,
        1,
        missing.length
      )
      .setValues([missing]);

    sheet
      .getRange(
        1,
        current.length+1,
        sheet.getMaxRows(),
        missing.length
      )
      .setNumberFormat('@');

    changed=true;
  });

  if(changed){
    /*
     * As gravações transacionais usam a API avançada do Sheets.
     * O flush garante que abas e colunas recém-criadas já existam
     * quando o batchUpdate seguinte for executado.
     */
    SpreadsheetApp.flush();
    resetData_();
  }

  return changed;
}
function generalTaskAssignableUsers_(){
  return all_('Usuarios')
    .filter(user=>
      bool_(user.ativo)&&
      hasPermission_(
        user,
        'consulta'
      )
    )
    .sort((a,b)=>
      String(
        a.nome||
        a.email
      ).localeCompare(
        String(
          b.nome||
          b.email
        ),
        'pt-BR',
        {sensitivity:'base'}
      )
    )
    .map(user=>({
      id:user.id,
      nome:user.nome||user.email,
      funcao:user.funcao||'',
      email:user.email,
      perfil:user.perfil||''
    }));
}

function generalTaskUserMaps_(){
  const users=
    all_('Usuarios');

  return {
    users,
    byEmail:new Map(
      users.map(user=>[
        String(
          user.email||
          ''
        ).toLowerCase(),
        user
      ])
    )
  };
}

function generalTaskDisplayUser_(email,usersByEmail){
  const key=
    String(
      email||
      ''
    ).toLowerCase();

  const user=
    usersByEmail.get(key);

  return user
    ?(
      user.nome||
      user.email
    )
    :String(email||'');
}

function generalTaskSummary_(task,usersByEmail,messageCounts,attachmentCounts,peopleById){
  let person=null;

  if(task.pessoaId){
    if(
      peopleById&&
      typeof peopleById.get==='function'
    ){
      person=
        peopleById.get(task.pessoaId)||
        null;
    }else{
      person=
        all_('Pessoas')
          .find(p=>
            p.id===task.pessoaId
          )||
        null;
    }
  }

  const due=
    taskDueState_(task);

  return {
    id:task.id,
    versao:task.versao,
    tipo:task.tipo,
    titulo:task.titulo||'Tarefa',
    descricao:task.descricao||'',
    pessoaId:task.pessoaId||'',
    pessoa:person?person.nome:'',
    pessoaCpf:person?person.cpf:'',
    pessoaCidade:person?person.cidade:'',
    pessoaJurisdicao:person?person.jurisdicao:'',
    pessoaEntidade:person?person.entidade:'',
    processoId:task.processoId||'',
    tags:taskTagsParse_(task.tags),
    modoDistribuicao:task.modoDistribuicao||'MANUAL',
    vencimentoEstado:due.estado,
    horasRestantes:due.horas,
    responsavel:task.responsavel||'',
    responsavelNome:
      generalTaskDisplayUser_(
        task.responsavel,
        usersByEmail
      ),
    criadoPor:task.criadoPor||'',
    criadoPorNome:
      generalTaskDisplayUser_(
        task.criadoPor,
        usersByEmail
      ),
    situacao:task.situacao||GENERAL_TASK_ASSIGNED,
    prioridade:task.prioridade||'NORMAL',
    prazo:task.prazo||'',
    criadoEm:task.criadoEm||'',
    atribuidaEm:task.atribuidaEm||'',
    concluidaEm:task.concluidaEm||'',
    alteradoEm:task.alteradoEm||'',
    mensagens:Number(
      messageCounts.get(task.id)||
      0
    ),
    anexos:Number(
      attachmentCounts.get(task.id)||
      0
    )
  };
}

function generalTaskCountMap_(rows){
  const map=new Map();

  rows.forEach(row=>{
    const taskId=
      String(
        row.tarefaId||
        ''
      );

    if(!taskId){
      return;
    }

    map.set(
      taskId,
      (
        map.get(taskId)||
        0
      )+1
    );
  });

  return map;
}


function taskMovementMaps_(tasks,messages,attachments,email){
  const lastByTask=new Map();
  const readByTask=new Map();

  const bump_=(taskId,when)=>{
    const id=
      String(taskId||'');
    const value=
      String(when||'');

    if(!id||!value)return;

    const current=
      String(
        lastByTask.get(id)||
        ''
      );

    if(!current||value>current){
      lastByTask.set(
        id,
        value
      );
    }
  };

  (tasks||[]).forEach(task=>{
    bump_(
      task.id,
      task.alteradoEm||
      task.atribuidaEm||
      task.criadoEm
    );
  });

  (messages||[]).forEach(row=>
    bump_(
      row.tarefaId,
      row.criadoEm||
      row.alteradoEm
    )
  );

  (attachments||[]).forEach(row=>
    bump_(
      row.tarefaId,
      row.criadoEm||
      row.alteradoEm
    )
  );

  const normalized=
    String(email||'')
      .toLowerCase();

  generalTaskRows_(
    'TarefaLeituras'
  )
    .forEach(row=>{
      if(
        !row.tarefaId||
        String(
          row.usuario||
          ''
        ).toLowerCase()!==
        normalized
      ){
        return;
      }

      const current=
        String(
          readByTask.get(
            row.tarefaId
          )||
          ''
        );

      const value=
        String(
          row.ultimoVistoEm||
          ''
        );

      if(
        !current||
        value>current
      ){
        readByTask.set(
          row.tarefaId,
          value
        );
      }
    });

  return {
    lastByTask,
    readByTask
  };
}

function taskViewMark_(ctx,q){
  ensureGeneralTaskSchema_();

  const task=
    get_(
      'Tarefas',
      required_(
        q.id,
        'tarefa'
      )
    );

  const user=
    activeUser_();

  if(
    task.tipo===
    GENERAL_TASK_TYPE
  ){
    requireGeneralTaskAccess_(
      task
    );
  }else if(
    task.tipo===
    DISTRIBUTION_TASK_TYPE
  ){
    const email=
      String(
        user.email||
        ''
      ).toLowerCase();

    const isOwner=
      email===
      String(
        task.responsavel||
        ''
      ).toLowerCase();

    const canManage=
      hasPermission_(
        user,
        'gestao_distribuicao'
      );

    if(
      !isOwner&&
      !canManage
    ){
      fail_(
        'Você não possui acesso a esta tarefa.'
      );
    }
  }else{
    fail_(
      'Tipo de tarefa inválido.'
    );
  }

  const email=
    String(
      user.email||
      ctx.email||
      ''
    ).toLowerCase();

  const rowId=
    id_(
      'TREAD',
      email+
      '|'+
      task.id
    );

  const previous=
    all_('TarefaLeituras')
      .find(row=>
        row.id===rowId
      )||
    null;

  const saved=
    change_(
      ctx,
      'TarefaLeituras',
      rowId,
      {
        tarefaId:task.id,
        usuario:email,
        ultimoVistoEm:now_()
      },
      previous
        ?previous.versao
        :undefined
    );

  return {
    tarefaId:task.id,
    ultimoVistoEm:
      saved.ultimoVistoEm
  };
}

function generalTaskSort_(a,b){
  const aDone=
    a.situacao===
    GENERAL_TASK_DONE;

  const bDone=
    b.situacao===
    GENERAL_TASK_DONE;

  if(aDone!==bDone){
    return aDone
      ?1
      :-1;
  }

  const aDue=
    String(
      a.prazo||
      '9999-12-31'
    );

  const bDue=
    String(
      b.prazo||
      '9999-12-31'
    );

  if(aDue!==bDue){
    return aDue.localeCompare(bDue);
  }

  return String(
    b.alteradoEm||
    b.criadoEm||
    ''
  ).localeCompare(
    String(
      a.alteradoEm||
      a.criadoEm||
      ''
    )
  );
}

function generalTaskManagementList_(){
  const maps=
    generalTaskUserMaps_();

  const messages=
    generalTaskRows_(
      'TarefaMensagens'
    );

  const attachments=
    generalTaskRows_(
      'TarefaAnexos'
    );

  const messageCounts=
    generalTaskCountMap_(messages);

  const attachmentCounts=
    generalTaskCountMap_(attachments);

  const tasks=
    all_('Tarefas')
      .filter(task=>
        task.tipo===
        GENERAL_TASK_TYPE
      )
      .sort(generalTaskSort_)
      .map(task=>
        generalTaskSummary_(
          task,
          maps.byEmail,
          messageCounts,
          attachmentCounts
        )
      );

  return {
    tarefas:tasks,
    usuarios:
      generalTaskAssignableUsers_(),
    abertas:
      tasks.filter(task=>
        task.situacao!==
        GENERAL_TASK_DONE
      ).length,
    concluidas:
      tasks.filter(task=>
        task.situacao===
        GENERAL_TASK_DONE
      ).length
  };
}

function myGeneralTasks_(){
  const email=
    String(
      identity_()||
      ''
    ).toLowerCase();

  const maps=
    generalTaskUserMaps_();

  const messages=
    generalTaskRows_(
      'TarefaMensagens'
    );

  const attachments=
    generalTaskRows_(
      'TarefaAnexos'
    );

  const messageCounts=
    generalTaskCountMap_(messages);

  const attachmentCounts=
    generalTaskCountMap_(attachments);

  const tasks=
    all_('Tarefas')
      .filter(task=>
        task.tipo===
          GENERAL_TASK_TYPE&&
        String(
          task.responsavel||
          ''
        ).toLowerCase()===
          email
      )
      .sort(generalTaskSort_)
      .map(task=>
        generalTaskSummary_(
          task,
          maps.byEmail,
          messageCounts,
          attachmentCounts
        )
      );

  return {
    pendentes:
      tasks.filter(task=>
        task.situacao!==
        GENERAL_TASK_DONE
      ),
    concluidas:
      tasks.filter(task=>
        task.situacao===
        GENERAL_TASK_DONE
      )
  };
}

function myTasks_(){
  const distribution=
    myDistributionTasks_();

  const general=
    myGeneralTasks_();

  return {
    email:distribution.email,
    pendentes:
      distribution.pendentes,
    concluidas:
      distribution.concluidas,
    geraisPendentes:
      general.pendentes,
    geraisConcluidas:
      general.concluidas
  };
}

function generalTaskParticipant_(task,user){
  const email=
    String(
      user&&user.email||
      ''
    ).toLowerCase();

  const creator=
    String(
      task.criadoPor||
      ''
    ).toLowerCase();

  const responsible=
    String(
      task.responsavel||
      ''
    ).toLowerCase();

  return (
    email===creator||
    email===responsible||
    hasPermission_(
      user,
      'gestao_distribuicao'
    )
  );
}

function requireGeneralTaskAccess_(task){
  if(
    !task||
    task.tipo!==
      GENERAL_TASK_TYPE
  ){
    fail_(
      'Tarefa interna inválida.'
    );
  }

  const user=
    activeUser_();

  if(
    !generalTaskParticipant_(
      task,
      user
    )
  ){
    fail_(
      'Você não participa desta tarefa.'
    );
  }

  return user;
}

function generalTaskDate_(value){
  const text=
    String(
      value||
      ''
    ).trim();

  if(!text){
    return '';
  }

  if(
    !/^\d{4}-\d{2}-\d{2}$/.test(text)
  ){
    fail_(
      'Prazo inválido.'
    );
  }

  const parsed=
    new Date(
      text+
      'T12:00:00Z'
    );

  if(
    Number.isNaN(
      parsed.getTime()
    )
  ){
    fail_(
      'Prazo inválido.'
    );
  }

  return text;
}

function generalTaskPriority_(value){
  const priority=
    String(
      value||
      'NORMAL'
    )
      .trim()
      .toUpperCase();

  if(
    !GENERAL_TASK_PRIORITIES
      .includes(priority)
  ){
    fail_(
      'Prioridade inválida.'
    );
  }

  return priority;
}

function generalTaskAssignee_(email){
  const normalized=
    String(
      required_(
        email,
        'responsável'
      )
    )
      .trim()
      .toLowerCase();

  const user=
    all_('Usuarios')
      .find(candidate=>
        String(
          candidate.email||
          ''
        ).toLowerCase()===
          normalized&&
        bool_(candidate.ativo)&&
        hasPermission_(
          candidate,
          'consulta'
        )
      );

  if(!user){
    fail_(
      'Usuário responsável não localizado ou inativo.'
    );
  }

  return {
    email:normalized,
    user
  };
}

function generalTaskData_(task,patch){
  return Object.assign(
    {
      tipo:GENERAL_TASK_TYPE,
      pessoaId:'',
      responsavel:
        task.responsavel||
        '',
      situacao:
        task.situacao||
        GENERAL_TASK_ASSIGNED,
      jurisdicao:'',
      valorCausa:'',
      atribuidaEm:
        task.atribuidaEm||
        '',
      concluidaEm:
        task.concluidaEm||
        '',
      processoId:'',
      observacoes:
        task.observacoes||
        '',
      titulo:
        task.titulo||
        '',
      descricao:
        task.descricao||
        '',
      criadoPor:
        task.criadoPor||
        '',
      prazo:
        task.prazo||
        '',
      prioridade:
        task.prioridade||
        'NORMAL',
      tags:
        task.tags||
        '[]',
      modoDistribuicao:
        task.modoDistribuicao||
        'MANUAL',
      origem:
        task.origem||
        'INTERNA'
    },
    patch||{}
  );
}

function generalTaskCreate_(ctx,q){
  ensureGeneralTaskSchema_();

  const title=
    String(
      required_(
        q.titulo,
        'título da tarefa'
      )
    ).trim();

  if(title.length>160){
    fail_(
      'O título da tarefa deve ter no máximo 160 caracteres.'
    );
  }

  const description=
    String(
      q.descricao||
      ''
    ).trim();

  if(description.length>6000){
    fail_(
      'As informações da tarefa devem ter no máximo 6.000 caracteres.'
    );
  }

  const assignee=
    generalTaskAssignee_(
      q.responsavel
    );

  let pessoaId=
    String(q.pessoaId||'').trim();

  if(pessoaId){
    get_('Pessoas',pessoaId);
  }

  const processoId=
    String(q.processoId||'').trim();

  if(processoId){
    const proc=get_('Processos',processoId);
    if(pessoaId&&proc.pessoaId!==pessoaId){
      fail_('O processo informado pertence a outro cadastro.');
    }
    pessoaId=pessoaId||proc.pessoaId;
  }

  const tags=
    taskTagsParse_(q.tags);

  const taskId=
    id_(
      'TAR',
      'GERAL:'+
      ctx.op
    );

  const created=
    change_(
      ctx,
      'Tarefas',
      taskId,
      generalTaskData_(
        {},
        {
          responsavel:
            assignee.email,
          situacao:
            GENERAL_TASK_ASSIGNED,
          atribuidaEm:now_(),
          titulo:title,
          descricao:description,
          criadoPor:
            String(
              ctx.email||
              ''
            ).toLowerCase(),
          prazo:
            generalTaskDate_(
              q.prazo
            ),
          prioridade:
            generalTaskPriority_(
              q.prioridade
            ),
          pessoaId,
          processoId,
          tags:JSON.stringify(tags),
          modoDistribuicao:'MANUAL'
        }
      )
    );

  return {
    tarefa:created,
    mensagem:
      'Tarefa criada e atribuída a '+
      (
        assignee.user.nome||
        assignee.email
      )+
      '.'
  };
}

function generalTaskDetail_(q){
  required_(
    q.id,
    'tarefa'
  );

  const task=
    get_(
      'Tarefas',
      q.id
    );

  const user=
    requireGeneralTaskAccess_(
      task
    );

  const maps=
    generalTaskUserMaps_();

  const messages=
    generalTaskRows_(
      'TarefaMensagens'
    )
      .filter(message=>
        message.tarefaId===
        task.id
      )
      .sort((a,b)=>
        String(
          a.criadoEm||
          ''
        ).localeCompare(
          String(
            b.criadoEm||
            ''
          )
        )
      )
      .map(message=>({
        id:message.id,
        autor:message.autor,
        autorNome:
          generalTaskDisplayUser_(
            message.autor,
            maps.byEmail
          ),
        mensagem:
          message.mensagem,
        criadoEm:
          message.criadoEm
      }));

  const attachments=
    generalTaskRows_(
      'TarefaAnexos'
    )
      .filter(attachment=>
        attachment.tarefaId===
        task.id
      )
      .sort((a,b)=>
        String(
          b.criadoEm||
          ''
        ).localeCompare(
          String(
            a.criadoEm||
            ''
          )
        )
      )
      .map(attachment=>({
        id:attachment.id,
        nome:attachment.nome,
        mime:attachment.mime,
        bytes:Number(
          attachment.bytes||
          0
        ),
        enviadoPor:
          attachment.enviadoPor,
        enviadoPorNome:
          generalTaskDisplayUser_(
            attachment.enviadoPor,
            maps.byEmail
          ),
        criadoEm:
          attachment.criadoEm
      }));

  const email=
    String(
      user.email||
      ''
    ).toLowerCase();

  const isCreator=
    email===
    String(
      task.criadoPor||
      ''
    ).toLowerCase();

  const isResponsible=
    email===
    String(
      task.responsavel||
      ''
    ).toLowerCase();

  const canManage=
    isCreator||
    hasPermission_(
      user,
      'gestao_distribuicao'
    );

  return {
    tarefa:
      generalTaskSummary_(
        task,
        maps.byEmail,
        new Map([
          [
            task.id,
            messages.length
          ]
        ]),
        new Map([
          [
            task.id,
            attachments.length
          ]
        ])
      ),
    mensagens:messages,
    anexos:attachments,
    usuarios:
      canManage
        ?generalTaskAssignableUsers_()
        :[],
    permissoes:{
      gerenciar:canManage,
      concluir:
        isResponsible||
        hasPermission_(
          user,
          'gestao_distribuicao'
        ),
      conversar:true,
      anexar:true
    }
  };
}

function generalTaskAssign_(ctx,q){
  ensureGeneralTaskSchema_();

  const task=
    get_(
      'Tarefas',
      required_(
        q.id,
        'tarefa'
      )
    );

  const user=
    requireGeneralTaskAccess_(
      task
    );

  const canManage=
    String(
      task.criadoPor||
      ''
    ).toLowerCase()===
      String(
        user.email||
        ''
      ).toLowerCase()||
    hasPermission_(
      user,
      'gestao_distribuicao'
    );

  if(!canManage){
    fail_(
      'Somente o criador da tarefa ou a gestão pode reatribuir.'
    );
  }

  if(
    task.situacao===
    GENERAL_TASK_DONE
  ){
    fail_(
      'Reabra a tarefa antes de reatribuir.'
    );
  }

  const assignee=
    generalTaskAssignee_(
      q.responsavel
    );

  return change_(
    ctx,
    'Tarefas',
    task.id,
    generalTaskData_(
      task,
      {
        responsavel:
          assignee.email,
        atribuidaEm:now_()
      }
    ),
    task.versao
  );
}

function generalTaskComplete_(ctx,q){
  ensureGeneralTaskSchema_();

  const task=
    get_(
      'Tarefas',
      required_(
        q.id,
        'tarefa'
      )
    );

  const user=
    requireGeneralTaskAccess_(
      task
    );

  const canComplete=
    String(
      task.responsavel||
      ''
    ).toLowerCase()===
      String(
        user.email||
        ''
      ).toLowerCase()||
    hasPermission_(
      user,
      'gestao_distribuicao'
    );

  if(!canComplete){
    fail_(
      'Somente o responsável pela tarefa pode concluí-la.'
    );
  }

  if(
    task.situacao===
    GENERAL_TASK_DONE
  ){
    return task;
  }

  return change_(
    ctx,
    'Tarefas',
    task.id,
    generalTaskData_(
      task,
      {
        situacao:
          GENERAL_TASK_DONE,
        concluidaEm:now_()
      }
    ),
    task.versao
  );
}

function generalTaskReopen_(ctx,q){
  ensureGeneralTaskSchema_();

  const task=
    get_(
      'Tarefas',
      required_(
        q.id,
        'tarefa'
      )
    );

  const user=
    requireGeneralTaskAccess_(
      task
    );

  const canManage=
    String(
      task.criadoPor||
      ''
    ).toLowerCase()===
      String(
        user.email||
        ''
      ).toLowerCase()||
    hasPermission_(
      user,
      'gestao_distribuicao'
    );

  if(!canManage){
    fail_(
      'Somente o criador da tarefa ou a gestão pode reabri-la.'
    );
  }

  if(
    task.situacao!==
    GENERAL_TASK_DONE
  ){
    return task;
  }

  return change_(
    ctx,
    'Tarefas',
    task.id,
    generalTaskData_(
      task,
      {
        situacao:
          GENERAL_TASK_ASSIGNED,
        concluidaEm:''
      }
    ),
    task.versao
  );
}

function generalTaskMessageSend_(ctx,q){
  ensureGeneralTaskSchema_();

  const task=
    get_(
      'Tarefas',
      required_(
        q.id,
        'tarefa'
      )
    );

  requireGeneralTaskAccess_(
    task
  );

  const text=
    String(
      required_(
        q.mensagem,
        'mensagem'
      )
    ).trim();

  if(text.length>3000){
    fail_(
      'A mensagem deve ter no máximo 3.000 caracteres.'
    );
  }

  const message=
    change_(
      ctx,
      'TarefaMensagens',
      id_(
        'TMSG',
        ctx.op
      ),
      {
        tarefaId:task.id,
        autor:
          String(
            ctx.email||
            ''
          ).toLowerCase(),
        mensagem:text
      }
    );

  return {
    mensagem:message
  };
}

function generalTasksRoot_(){
  const root=
    DriveApp.getFolderById(
      PDA.parent
    );

  const folders=
    root.getFoldersByName(
      '_TAREFAS'
    );

  const folder=
    folders.hasNext()
      ?folders.next()
      :root.createFolder(
        '_TAREFAS'
      );

  if(folders.hasNext()){
    fail_(
      'Há mais de uma pasta _TAREFAS no Drive. Administração deve reconciliar as pastas.'
    );
  }

  return folder;
}

function generalTaskFolder_(task){
  const root=
    generalTasksRoot_();

  const name=
    safeName_(
      task.id+
      ' - '+
      task.titulo
    );

  const folders=
    root.getFoldersByName(name);

  const folder=
    folders.hasNext()
      ?folders.next()
      :root.createFolder(name);

  if(folders.hasNext()){
    fail_(
      'Há mais de uma pasta para esta tarefa. Administração deve reconciliar as pastas.'
    );
  }

  return folder;
}

function generalTaskAttachmentAdd_(ctx,q){
  ensureGeneralTaskSchema_();

  const task=
    get_(
      'Tarefas',
      required_(
        q.id,
        'tarefa'
      )
    );

  requireGeneralTaskAccess_(
    task
  );

  if(
    String(
      q.mime||
      ''
    )!=='application/pdf'
  ){
    fail_(
      'Somente arquivos PDF podem ser anexados à tarefa.'
    );
  }

  const payload=
    filePayload_(q);

  const duplicate=
    all_('TarefaAnexos')
      .find(attachment=>
        attachment.tarefaId===
          task.id&&
        attachment.hash===
          payload.digest
      );

  if(duplicate){
    return {
      anexo:duplicate,
      mensagem:
        'Este PDF já está anexado à tarefa.'
    };
  }

  const linkedPerson=
    task.pessoaId
      ?get_('Pessoas',task.pessoaId)
      :null;

  const folder=
    linkedPerson
      ?personFolder_(linkedPerson)
      :generalTaskFolder_(task);

  const rawName=
    safeName_(
      q.nome||
      'anexo.pdf'
    );

  const basePrefix=
    linkedPerson
      ?'TAREFA.'+safeName_(task.titulo||'ANEXO')+'.'
      :'';

  const base=
    basePrefix+
    (
      rawName
        .replace(
          /\.pdf$/i,
          ''
        )||
      'anexo'
    )
      .slice(
        0,
        160
      );

  const name=
    uniqueFileName_(
      folder,
      base,
      'pdf'
    );

  const file=
    folder.createFile(
      Utilities.newBlob(
        payload.bytes,
        payload.mime,
        name
      )
    );

  file.setDescription(
    'PDA_TASK_ATTACHMENT:'+
    task.id
  );

  ctx.effects.push(
    'PDF anexado à tarefa no Drive: '+
    file.getUrl()
  );

  const attachmentId=
    id_(
      'TANX',
      ctx.op
    );

  let documento=null;

  if(linkedPerson){
    const documentId=
      id_(
        'DOC',
        'TAREFA:'+attachmentId
      );

    documento=
      change_(
        ctx,
        'Documentos',
        documentId,
        {
          atendimentoId:personOwnerKey_(linkedPerson.id),
          categoria:'ANEXO_TAREFA',
          fileId:file.getId(),
          url:file.getUrl(),
          nome:file.getName(),
          hash:payload.digest,
          mime:payload.mime,
          substituiId:'',
          vigente:true,
          vencimento:'',
          terceiro:false,
          conferido:false,
          declaracaoTerceiro:false,
          processoCompleto:false,
          anexoPresente:true,
          rogo:false,
          testemunhas:false,
          observacoes:'Arquivo anexado à tarefa "'+(task.titulo||task.id)+'".'
        }
      );
  }

  const attachment=
    change_(
      ctx,
      'TarefaAnexos',
      attachmentId,
      {
        tarefaId:task.id,
        fileId:file.getId(),
        url:file.getUrl(),
        nome:file.getName(),
        mime:payload.mime,
        hash:payload.digest,
        bytes:String(
          payload.bytes.length
        ),
        enviadoPor:
          String(
            ctx.email||
            ''
          ).toLowerCase(),
        pessoaId:linkedPerson?linkedPerson.id:'',
        documentoId:documento?documento.id:''
      }
    );

  return {
    anexo:attachment,
    documento,
    mensagem:
      linkedPerson
        ?'PDF anexado à tarefa e aos documentos do cadastro.'
        :'PDF anexado à tarefa.'
  };
}

function taskNotifications_(){
  const email=
    String(
      identity_()||
      ''
    ).toLowerCase();

  const state=
    generalTaskRows_(
      'TarefaLeituras'
    ).find(row=>
      !String(
        row.tarefaId||
        ''
      ).trim()&&
      String(
        row.usuario||
        ''
      ).toLowerCase()===
      email
    )||null;

  const lastSeen=
    String(
      state&&state.ultimoVistoEm||
      ''
    );

  const maps=taskMapsV2_();

  const tasks=
    all_('Tarefas')
      .filter(task=>
        String(
          task.responsavel||
          ''
        ).toLowerCase()===
          email&&
        task.situacao!==
          GENERAL_TASK_DONE&&
        task.situacao!==
          DISTRIBUTION_TASK_DONE
      )
      .map(task=>
        taskSummaryV2_(
          task,
          maps
        )
      )
      .sort((a,b)=>
        String(
          b.atribuidaEm||
          b.criadoEm||
          ''
        ).localeCompare(
          String(
            a.atribuidaEm||
            a.criadoEm||
            ''
          )
        )
      );

  const isNew=task=>{
    const when=
      String(
        task.atribuidaEm||
        task.criadoEm||
        ''
      );

    return (
      !!when&&
      (
        !lastSeen||
        when>lastSeen
      )
    );
  };

  return {
    naoLidas:
      tasks.filter(task=>
        isNew(task)||
        task.novaManifestacao
      ).length,
    ultimoVistoEm:lastSeen,
    itens:
      tasks.slice(0,20)
        .map(task=>({
          id:task.id,
          titulo:task.titulo||'Tarefa',
          criadoPor:task.criadoPor||'',
          criadoPorNome:task.criadoPorNome||'',
          prioridade:task.prioridade||'NORMAL',
          prazo:task.prazo||'',
          situacao:task.situacao||'',
          atribuidaEm:
            task.atribuidaEm||
            task.criadoEm||
            '',
          tipo:task.tipo,
          tipoLabel:task.tipoLabel,
          pessoa:task.pessoa||'',
          vencimentoEstado:
            task.vencimentoEstado,
          novaManifestacao:
            !!task.novaManifestacao,
          ultimaMovimentacaoEm:
            task.ultimaMovimentacaoEm||
            '',
          nova:
            isNew(task)||
            !!task.novaManifestacao
        }))
  };
}

function taskNotificationsMarkSeen_(ctx){
  ensureGeneralTaskSchema_();

  const email=
    String(
      ctx.email||
      identity_()||
      ''
    ).toLowerCase();

  const rowId=
    id_(
      'TREAD',
      email
    );

  const previous=
    all_('TarefaLeituras')
      .find(row=>
        row.id===rowId
      )||null;

  const seenAt=now_();

  const saved=
    change_(
      ctx,
      'TarefaLeituras',
      rowId,
      {
        tarefaId:'',
        usuario:email,
        ultimoVistoEm:seenAt
      },
      previous
        ?previous.versao
        :undefined
    );

  return {
    ultimoVistoEm:saved.ultimoVistoEm,
    mensagem:'Notificações de tarefas marcadas como vistas.'
  };
}

function generalTaskAttachmentContent_(q){
  const task=
    get_(
      'Tarefas',
      required_(
        q.id,
        'tarefa'
      )
    );

  requireGeneralTaskAccess_(
    task
  );

  const attachment=
    generalTaskRows_(
      'TarefaAnexos'
    )
      .find(item=>
        item.id===
          q.anexoId&&
        item.tarefaId===
          task.id
      );

  if(!attachment){
    fail_(
      'Anexo não localizado.'
    );
  }

  const file=
    DriveApp.getFileById(
      attachment.fileId
    );

  if(file.isTrashed()){
    fail_(
      'O PDF não está mais disponível no repositório do sistema.'
    );
  }

  const blob=
    file.getBlob();

  return {
    nome:
      attachment.nome||
      file.getName(),
    mime:
      attachment.mime||
      blob.getContentType()||
      'application/pdf',
    base64:
      Utilities.base64Encode(
        blob.getBytes()
      )
  };
}
