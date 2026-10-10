const fs = require('fs');
let content = fs.readFileSync('desktop/backend/chat-turn-pipeline.mjs', 'utf8');

content = content.replace(/const runTurn = async \(\{\n([^}]+)\}\) => \{/m, (match, p1) => {
  if (!p1.includes('attachments')) {
    return `const runTurn = async ({\n${p1}    attachments,\n  }) => {`;
  }
  return match;
});

content = content.replace(/result = await chat\.send\(\{\n\s*text: command,\n([^}]+)\}\)/m, (match, p1) => {
  if (!p1.includes('attachments')) {
    return `result = await chat.send({\n      text: command,\n${p1}      attachments,\n    })`;
  }
  return match;
});

content = content.replace(/executeChatRequest\(\n\s*execution,\n\s*effectivePrompt,\n\s*resolvePrimaryAgentPreset\(text, workMode, activeKey\),\n\s*activeKey,\n\s*selectedSkill,\n\s*webContents,\n\s*conversationId,\n\s*runtimeContext,\n\s*permissionMode,\n\s*text,\n\s*contextLayers\n\s*\)/m, 
`executeChatRequest(
        execution,
        effectivePrompt,
        resolvePrimaryAgentPreset(text, workMode, activeKey),
        activeKey,
        selectedSkill,
        webContents,
        conversationId,
        runtimeContext,
        permissionMode,
        text,
        contextLayers,
        attachments
      )`);

content = content.replace(/const executeChatRequest = async \(execution, effectivePrompt, primaryAgentPreset, activeKey, selectedSkill, webContents, conversationId, runtimeContext, permissionMode = runtimeContext.permissionMode, rawText, contextLayers\) => \{/m,
`const executeChatRequest = async (execution, effectivePrompt, primaryAgentPreset, activeKey, selectedSkill, webContents, conversationId, runtimeContext, permissionMode = runtimeContext.permissionMode, rawText, contextLayers, attachments) => {`);

content = content.replace(/executeMultiAgent\(effectivePrompt, primaryAgentPreset, activeKey, selectedSkill, webContents, execution, conversationId, runtimeContext, permissionMode, rawText, contextLayers\)/m,
`executeMultiAgent(effectivePrompt, primaryAgentPreset, activeKey, selectedSkill, webContents, execution, conversationId, runtimeContext, permissionMode, rawText, contextLayers, attachments)`);

content = content.replace(/executeSingleAgent\(effectivePrompt, primaryAgentPreset, activeKey, selectedSkill, webContents, execution, conversationId, runtimeContext, permissionMode\)/m,
`executeSingleAgent(effectivePrompt, primaryAgentPreset, activeKey, selectedSkill, webContents, execution, conversationId, runtimeContext, permissionMode, attachments)`);

content = content.replace(/const executeSingleAgent = async \(effectivePrompt, primaryAgentPreset, activeKey, _selectedSkill, webContents, _execution, conversationId, runtimeContext, permissionMode\) => \{/m,
`const executeSingleAgent = async (effectivePrompt, primaryAgentPreset, activeKey, _selectedSkill, webContents, _execution, conversationId, runtimeContext, permissionMode, attachments) => {`);

content = content.replace(/return chat\.send\(\{\n\s*text: effectivePrompt,\n([^}]+)skill: null,\n\s*\}\)/m,
(match, p1) => {
  return `return chat.send({\n      text: effectivePrompt,\n${p1}skill: null,\n      attachments,\n    })`
});

content = content.replace(/const executeMultiAgent = async \(effectivePrompt, primaryAgentPreset, activeKey, selectedSkill, webContents, execution, conversationId, runtimeContext, permissionMode, rawText, contextLayers\) => \{/m,
`const executeMultiAgent = async (effectivePrompt, primaryAgentPreset, activeKey, selectedSkill, webContents, execution, conversationId, runtimeContext, permissionMode, rawText, contextLayers, attachments) => {`);

content = content.replace(/return chat\.send\(\{\n\s*text: assembledCommand,\n([^}]+)\}\)/m,
(match, p1) => {
  if (p1.includes('executionModeOverride:')) {
    return `return chat.send({\n      text: assembledCommand,\n${p1}      attachments,\n    })`;
  }
  return match;
});

fs.writeFileSync('desktop/backend/chat-turn-pipeline.mjs', content, 'utf8');
