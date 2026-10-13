function buildApplicationMenuTemplate({ platform = process.platform, includeDeveloperTools = false } = {}) {
  const template = []

  if (platform === 'darwin') template.push({ role: 'appMenu' })
  template.push({ role: 'editMenu' })
  if (includeDeveloperTools) template.push({ role: 'viewMenu' })
  template.push({ role: 'windowMenu' })

  return template
}

module.exports = { buildApplicationMenuTemplate }
