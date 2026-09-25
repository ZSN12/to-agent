/** Build a TaskWeaver-owned prompt envelope for an explicitly selected Skill. */
export function applySkillInstructions(text, skill) {
  if (!skill) return text

  const safeName = String(skill.name).replace(/[<>"&]/g, '')
  const safeBaseDir = String(skill.baseDir ?? '').replace(/[<>]/g, '')
  return [
    `以下是用户在 TaskWeaver 中明确选择的 Skill「${safeName}」的执行指引。请将其作为本任务的工作流程约束；若与用户本条具体要求冲突，以用户要求为准。`,
    safeBaseDir ? `该 Skill 的资源目录：${safeBaseDir}。若指引引用相对路径，应相对此目录读取。` : '',
    '<taskweaver_skill_instructions>',
    skill.instructions,
    '</taskweaver_skill_instructions>',
    '<user_task>',
    text,
    '</user_task>',
  ].filter(Boolean).join('\n\n')
}
