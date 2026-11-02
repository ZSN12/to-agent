import { useId, type ReactNode } from 'react'

function classes(...values: Array<string | undefined>) {
  return values.filter(Boolean).join(' ')
}

export function SettingsLayout({
  title,
  description,
  actions,
  actionsClassName,
  className,
  children,
}: {
  title: string
  description?: ReactNode
  actions?: ReactNode
  actionsClassName?: string
  className?: string
  children: ReactNode
}) {
  const titleId = useId()
  return (
    <section className={classes('settings-page-content', 'settings-layout', className)} aria-labelledby={titleId}>
      <header className="settings-page-heading">
        <div className="settings-layout-heading-copy">
          <h1 id={titleId}>{title}</h1>
          {description ? <p>{description}</p> : null}
        </div>
        {actions ? <div className={classes('settings-page-heading-actions', actionsClassName)}>{actions}</div> : null}
      </header>
      <div className="settings-layout-content">{children}</div>
    </section>
  )
}

export function SettingsPanel({
  title,
  description,
  icon,
  actions,
  className,
  children,
}: {
  title: string
  description?: ReactNode
  icon?: ReactNode
  actions?: ReactNode
  className?: string
  children: ReactNode
}) {
  const titleId = useId()
  return (
    <section className={classes('settings-layout-panel', className)} aria-labelledby={titleId}>
      <header className="settings-layout-panel-heading">
        {icon ? <span className="settings-layout-panel-icon" aria-hidden="true">{icon}</span> : null}
        <div className="settings-layout-panel-copy">
          <h2 id={titleId}>{title}</h2>
          {description ? <p>{description}</p> : null}
        </div>
        {actions ? <div className="settings-layout-panel-actions">{actions}</div> : null}
      </header>
      <div className="settings-layout-panel-body">{children}</div>
    </section>
  )
}

export function SettingsGroup({ title, description, className, children }: {
  title?: string
  description?: ReactNode
  className?: string
  children: ReactNode
}) {
  const titleId = useId()
  return (
    <section className={classes('settings-layout-group', className)} aria-labelledby={title ? titleId : undefined}>
      {title ? <h3 id={titleId}>{title}</h3> : null}
      {description ? <p className="settings-layout-group-description">{description}</p> : null}
      <div className="settings-layout-group-content">{children}</div>
    </section>
  )
}

export function SettingsRow({ label, description, className, children }: {
  label: ReactNode
  description?: ReactNode
  className?: string
  children: ReactNode
}) {
  const labelId = useId()
  const descriptionId = useId()
  return (
    <div className={classes('settings-layout-row', className)} role="group" aria-labelledby={labelId} aria-describedby={description ? descriptionId : undefined}>
      <div className="settings-layout-row-copy">
        <div className="settings-layout-row-label" id={labelId}>{label}</div>
        {description ? <div className="settings-layout-row-description" id={descriptionId}>{description}</div> : null}
      </div>
      <div className="settings-layout-row-control">{children}</div>
    </div>
  )
}

export function SettingsSwitch({ checked, onChange, label, description, className, disabled = false }: {
  checked: boolean
  onChange: (checked: boolean) => void
  label: string
  description?: ReactNode
  className?: string
  disabled?: boolean
}) {
  return (
    <label className={classes('settings-layout-switch', className, disabled ? 'is-disabled' : undefined)}>
      <span className="settings-layout-switch-copy">
        <span className="settings-layout-switch-label">{label}</span>
        {description ? <span className="settings-layout-switch-description">{description}</span> : null}
      </span>
      <span className="settings-layout-switch-control">
        <input type="checkbox" checked={checked} disabled={disabled} onChange={(event) => onChange(event.target.checked)} />
        <span className="settings-layout-switch-track" aria-hidden="true" />
      </span>
    </label>
  )
}

export function SettingsSegmented<Value extends string>({
  label,
  value,
  options,
  onChange,
  className,
  disabled = false,
}: {
  label: string
  value: Value
  options: ReadonlyArray<{ value: Value; label: string; description?: string }>
  onChange: (value: Value) => void
  className?: string
  disabled?: boolean
}) {
  return (
    <div className={classes('settings-layout-segmented', className)} role="group" aria-label={label}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          aria-pressed={value === option.value}
          title={option.description}
          disabled={disabled}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}
