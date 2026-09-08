function fillMsgs(scrollToBottom=false){
  const box=$('#msgs');
  if(!box) return;

  const a=messages.filter(m =>
    selectedGroup
      ? m.groupId===selectedGroup.id
      : !m.groupId && (
          (m.from===me.id && m.to===selectedUser?.id) ||
          (m.from===selectedUser?.id && m.to===me.id)
        )
  );

  box.innerHTML = a.map(m => {
    const sender = users.find(u => u.id === m.from);
    const senderName = sender ? sender.name : 'Utilizador';
    const senderPhoto = sender ? avatar(sender, 'mini-avatar') : '';

    const senderHtml = selectedGroup
      ? `<div class="group-sender">${senderPhoto}<b>${escapeHtml(senderName)}</b></div>`
      : '';

    return `
      <div class="bubble ${m.from===me.id?'me':''}">
        ${senderHtml}
        ${m.text ? `<div>${escapeHtml(m.text)}</div>` : ''}
        ${mediaHtml(m)}
        <div class="muted bubble-time">${fmtTime(m.time)}</div>
      </div>
    `;
  }).join('') || '<p class="muted">Começa a conversa.</p>';

  if(scrollToBottom) box.scrollTop=box.scrollHeight;
}
