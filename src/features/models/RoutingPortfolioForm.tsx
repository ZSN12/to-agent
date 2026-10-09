import { useState } from 'react'
import { Plus, Save, Trash2 } from 'lucide-react'
import type { RoutingPortfolio } from '../../shared/app-api'
import './RoutingPortfolioForm.css'

type Subscription = NonNullable<RoutingPortfolio['subscriptions']>[number]
type QuotaPolicy = NonNullable<NonNullable<RoutingPortfolio['quota_cycles']>['policies']>[number]
type BalancePolicy = NonNullable<RoutingPortfolio['balance_policies']>[number]

function rows<T>(value: T[] | undefined): T[] {
  return Array.isArray(value) ? value : []
}

function asObject<T extends object>(value: T | undefined): T {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {} as T
}

function listError(value: unknown, required: boolean, label: string): string | null {
  if (value === undefined && !required) return null
  if (!Array.isArray(value)) return required ? `${label}至少填写一条规则。` : `${label}必须是文本规则数组。`
  if (value.some((item) => typeof item !== 'string')) return `${label}只能包含文本。`
  if (value.some((item) => !item.trim())) return `${label}中有空白项，请填写或删除。`
  if (required && value.filter((item) => item.trim()).length === 0) return `${label}至少填写一条规则。`
  return null
}

function stringValue(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

function validate(portfolio: RoutingPortfolio): string[] {
  const errors: string[] = []
  const subscriptions = rows(portfolio.subscriptions)
  const ids = new Set<string>()
  subscriptions.forEach((subscription, index) => {
    const prefix = `订阅 ${index + 1}`
    const id = stringValue(subscription.id).trim()
    if (!id) errors.push(`${prefix}：请填写唯一的订阅 ID。`)
    else if (ids.has(id)) errors.push(`${prefix}：订阅 ID「${id}」重复。`)
    else ids.add(id)
    if (!stringValue(subscription.label).trim()) errors.push(`${prefix}：请填写显示名称。`)
    const preferError = listError(subscription.prefer_models, true, `${prefix}的优先模型规则`)
    const deprioritizeError = listError(subscription.deprioritize_models, false, `${prefix}的降权模型规则`)
    if (preferError) errors.push(preferError)
    if (deprioritizeError) errors.push(deprioritizeError)
    if (subscription.marginal_cost !== undefined
      && (!Number.isFinite(subscription.marginal_cost) || subscription.marginal_cost < 0)) {
      errors.push(`${prefix}：边际成本必须是大于或等于 0 的数字。`)
    }
  })

  const freeError = listError(portfolio.free_model_patterns, false, '免费模型规则')
  if (freeError) errors.push(freeError)

  rows(portfolio.quota_cycles?.policies).forEach((policy, index) => {
    if (!stringValue(policy.provider_id).trim()) errors.push(`配额规则 ${index + 1}：请填写 OpenUsage provider ID。`)
    if (!stringValue(policy.resource_id).trim()) errors.push(`配额规则 ${index + 1}：请填写资源 ID。`)
    const patternError = listError(policy.match_model_keys, false, `配额规则 ${index + 1} 的模型规则`)
    if (patternError) errors.push(patternError)
  })

  rows(portfolio.balance_policies).forEach((policy, index) => {
    if (!stringValue(policy.provider_id).trim()) errors.push(`余额规则 ${index + 1}：请填写 OpenUsage provider ID。`)
    if (!stringValue(policy.resource_id).trim()) errors.push(`余额规则 ${index + 1}：请填写资源 ID。`)
    if (!stringValue(policy.unit).trim()) errors.push(`余额规则 ${index + 1}：请填写与 OpenUsage 一致的余额单位。`)
    const patternError = listError(policy.match_model_keys, true, `余额规则 ${index + 1} 的模型规则`)
    if (patternError) errors.push(patternError)
    if (policy.low_balance_threshold !== undefined
      && (!Number.isFinite(policy.low_balance_threshold) || policy.low_balance_threshold < 0)) {
      errors.push(`余额规则 ${index + 1}：低余额阈值必须是大于或等于 0 的数字。`)
    }
  })

  return errors
}

function Field({
  label,
  hint,
  value,
  onChange,
  placeholder,
  type = 'text',
  min,
  max,
  step,
}: {
  label: string
  hint?: string
  value: string | number | undefined
  onChange: (value: string | number | undefined) => void
  placeholder?: string
  type?: 'text' | 'number' | 'url'
  min?: number
  max?: number
  step?: number
}) {
  return (
    <label className="portfolio-form-field">
      <span>{label}</span>
      <input
        className="settings-text-input"
        type={type}
        value={value ?? ''}
        min={min}
        max={max}
        step={step}
        placeholder={placeholder}
        onChange={(event) => {
          if (type !== 'number') onChange(event.target.value)
          else onChange(event.target.value === '' ? undefined : Number(event.target.value))
        }}
      />
      {hint ? <small>{hint}</small> : null}
    </label>
  )
}

function PatternList({
  label,
  values,
  onChange,
  hint,
}: {
  label: string
  values: string[] | undefined
  onChange: (values: string[]) => void
  hint?: string
}) {
  const items = rows(values)
  return (
    <div className="portfolio-pattern-list">
      <div className="portfolio-pattern-head">
        <span>{label}</span>
        <button type="button" className="settings-secondary-button" onClick={() => onChange([...items, ''])}>
          <Plus size={13} /> 添加规则
        </button>
      </div>
      {hint ? <small>{hint}</small> : null}
      {items.length === 0 ? <p className="portfolio-empty-hint">未添加规则</p> : null}
      {items.map((item, index) => (
        <div className="portfolio-pattern-row" key={index}>
          <input
            className="settings-text-input"
            value={typeof item === 'string' ? item : ''}
            placeholder="例如：渠道/模型-*"
            aria-label={`${label} ${index + 1}`}
            onChange={(event) => onChange(items.map((entry, entryIndex) => entryIndex === index ? event.target.value : entry))}
          />
          <button
            type="button"
            className="settings-danger-button portfolio-icon-button"
            aria-label={`删除${label} ${index + 1}`}
            onClick={() => onChange(items.filter((_, entryIndex) => entryIndex !== index))}
          >
            <Trash2 size={14} />
          </button>
        </div>
      ))}
    </div>
  )
}

function Toggle({
  label,
  checked,
  onChange,
  hint,
}: {
  label: string
  checked: boolean
  onChange: (value: boolean) => void
  hint?: string
}) {
  return (
    <label className="portfolio-form-toggle">
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
      <span><strong>{label}</strong>{hint ? <small>{hint}</small> : null}</span>
    </label>
  )
}

export function RoutingPortfolioForm({
  portfolio,
  onChange,
  onSave,
  disabled = false,
  saving = false,
}: {
  portfolio: RoutingPortfolio | null
  onChange: (portfolio: RoutingPortfolio) => void
  onSave: (portfolio: RoutingPortfolio) => Promise<void>
  disabled?: boolean
  saving?: boolean
}) {
  const [validationErrors, setValidationErrors] = useState<string[]>([])
  if (!portfolio) return <p className="settings-list-empty">路由作品集尚未加载。</p>

  const subscriptions = rows(portfolio.subscriptions)
  const usage = asObject(portfolio.usage_source)
  const quota = asObject(portfolio.quota_cycles)
  const quotaPolicies = rows(quota.policies)
  const balancePolicies = rows(portfolio.balance_policies)

  const update = (next: RoutingPortfolio) => {
    setValidationErrors([])
    onChange(next)
  }
  const updateSubscription = (index: number, patch: Partial<Subscription>) => update({
    ...portfolio,
    subscriptions: subscriptions.map((item, itemIndex) => itemIndex === index ? { ...item, ...patch } : item),
  })
  const updateQuota = (patch: Partial<NonNullable<RoutingPortfolio['quota_cycles']>>) => update({
    ...portfolio,
    quota_cycles: { ...quota, ...patch },
  })
  const updateQuotaPolicy = (index: number, patch: Partial<QuotaPolicy>) => updateQuota({
    policies: quotaPolicies.map((item, itemIndex) => itemIndex === index ? { ...item, ...patch } : item),
  })
  const updateBalancePolicy = (index: number, patch: Partial<BalancePolicy>) => update({
    ...portfolio,
    balance_policies: balancePolicies.map((item, itemIndex) => itemIndex === index ? { ...item, ...patch } : item),
  })
  const save = async () => {
    const errors = validate(portfolio)
    setValidationErrors(errors)
    if (errors.length > 0) return
    await onSave(portfolio)
  }

  return (
    <section className="portfolio-form-section" aria-labelledby="portfolio-form-heading">
      <div className="portfolio-form-header">
        <div>
          <h3 id="portfolio-form-heading">额度与账号路由</h3>
          <p>按你实际拥有的账号和套餐填写；这里不预设任何厂商、模型或订阅。可选数字留空时使用系统默认值，配置会保存在当前用户目录。</p>
        </div>
        <button type="button" className="settings-primary-button" disabled={disabled || saving} onClick={() => { void save() }}>
          <Save size={14} /> {saving ? '保存中…' : '保存额度路由'}
        </button>
      </div>

      {disabled ? <p className="portfolio-json-blocked">高级 JSON 当前有格式错误，请先修复 JSON 后再编辑或保存结构化配置。</p> : null}
      {validationErrors.length > 0 ? (
        <div className="portfolio-validation-errors" role="alert">
          <strong>请先修正以下配置：</strong>
          <ul>{validationErrors.map((message, index) => <li key={`${index}-${message}`}>{message}</li>)}</ul>
        </div>
      ) : null}

      <fieldset className="portfolio-form-body" disabled={disabled || saving}>
        <article className="portfolio-form-card">
          <div className="portfolio-form-card-heading">
            <div><h4>订阅套餐</h4><p>填写订阅名称和该订阅覆盖的模型匹配规则；可为不同账号分别添加。</p></div>
            <button
              type="button"
              className="settings-secondary-button"
              onClick={() => update({ ...portfolio, subscriptions: [...subscriptions, { id: '', label: '', prefer_models: [] }] })}
            ><Plus size={14} /> 添加订阅</button>
          </div>
          {subscriptions.length === 0 ? <p className="portfolio-empty-hint">还没有配置订阅套餐。</p> : null}
          {subscriptions.map((subscription, index) => (
            <div className="portfolio-policy-card" key={`${subscription.id || 'subscription'}-${index}`}>
              <div className="portfolio-policy-heading">
                <strong>订阅 {index + 1}</strong>
                <button type="button" className="settings-danger-button" onClick={() => update({ ...portfolio, subscriptions: subscriptions.filter((_, itemIndex) => itemIndex !== index) })}><Trash2 size={13} /> 删除</button>
              </div>
              <div className="portfolio-form-grid">
                <Field label="订阅 ID（必填）" value={stringValue(subscription.id)} placeholder="自定义唯一标识" onChange={(value) => updateSubscription(index, { id: String(value ?? '') })} />
                <Field label="显示名称（必填）" value={stringValue(subscription.label)} placeholder="套餐或账号的自定义名称" onChange={(value) => updateSubscription(index, { label: String(value ?? '') })} />
                <Field label="边际成本" hint="路由评分中的成本权重；留空表示按订阅免费处理。" type="number" min={0} step={0.01} value={subscription.marginal_cost} onChange={(value) => updateSubscription(index, { marginal_cost: typeof value === 'number' ? value : undefined })} />
                <Field label="备注" value={stringValue(subscription.note)} placeholder="可选" onChange={(value) => updateSubscription(index, { note: String(value ?? '') })} />
              </div>
              <PatternList label="优先模型规则（必填）" values={subscription.prefer_models} hint="支持模型 key 通配符；至少填写一条。" onChange={(values) => updateSubscription(index, { prefer_models: values })} />
              <PatternList label="降权模型规则" values={subscription.deprioritize_models} hint="可选；匹配的模型不会使用此订阅优先级。" onChange={(values) => updateSubscription(index, { deprioritize_models: values })} />
            </div>
          ))}
        </article>

        <article className="portfolio-form-card">
          <div className="portfolio-form-card-heading">
            <div><h4>免费模型</h4><p>填写确实能免费调用的模型规则；不要求这些模型来自 OpenUsage。</p></div>
          </div>
          <PatternList label="免费模型规则" values={portfolio.free_model_patterns} hint="支持模型 key 通配符；留空表示不手动标记免费模型。" onChange={(values) => update({ ...portfolio, free_model_patterns: values })} />
        </article>

        <article className="portfolio-form-card">
          <div className="portfolio-form-card-heading">
            <div><h4>OpenUsage 消费额度</h4><p>新鲜的 consumption 资源会参与路由。provider/resource ID 来自 OpenUsage；未知或过期资源会跳过。</p></div>
          </div>
          <Toggle
            label="读取本机 OpenUsage"
            checked={usage.enabled === true}
            onChange={(enabled) => update({ ...portfolio, usage_source: { ...usage, enabled } })}
            hint="使用模型设置中 OpenUsage 面板配置的本机地址；仅主进程访问接口。"
          />
          <Toggle
            label="将消费额度用于选模"
            checked={quota.enabled === true}
            onChange={(enabled) => updateQuota({ enabled })}
            hint="额度充足时优先使用，接近耗尽时降低权重；明确配置的耗尽池可排除模型。"
          />
          <Toggle
            label="自动发现消费额度池"
            checked={quota.auto_discover === true}
            onChange={(auto_discover) => updateQuota({ auto_discover })}
            hint="按 OpenUsage provider 和模型渠道匹配 consumption 资源；balance 资源不会自动套用阈值。"
          />
          <div className="portfolio-form-grid">
            <Field
              label="请求超时（毫秒）"
              type="number"
              min={50}
              max={2000}
              step={50}
              value={usage.timeout_ms}
              onChange={(value) => update({ ...portfolio, usage_source: { ...usage, timeout_ms: typeof value === 'number' ? value : undefined } })}
            />
            <Field
              label="DAG 同渠道复用降权"
              type="number"
              min={0}
              step={1}
              value={quota.dag_allocation_penalty_points}
              hint="每个已分配子任务增加的评分扣分；这是批内软均衡，不是 token 预测或真实扣额。"
              onChange={(value) => updateQuota({ dag_allocation_penalty_points: typeof value === 'number' ? value : undefined })}
            />
          </div>

          <div className="portfolio-subsection-heading">
            <h5>指定消费额度池</h5>
            <p>自动发现覆盖常见渠道；在此为特殊账号或资源指定模型范围。</p>
          </div>
          <div className="portfolio-form-card-heading">
            <span />
            <button
              type="button"
              className="settings-secondary-button"
              onClick={() => updateQuota({ policies: [...quotaPolicies, { provider_id: '', resource_id: '', rollover: 'unknown', exhausted_action: 'exclude' }] })}
            ><Plus size={14} /> 添加额度池</button>
          </div>
          {quotaPolicies.length === 0 ? <p className="portfolio-empty-hint">未添加指定额度池；自动发现仍按上方开关工作。</p> : null}
          {quotaPolicies.map((policy, index) => (
            <div className="portfolio-policy-card" key={`${policy.provider_id || 'quota'}-${policy.resource_id || index}-${index}`}>
              <div className="portfolio-policy-heading">
                <strong>额度池 {index + 1}</strong>
                <button type="button" className="settings-danger-button" onClick={() => updateQuota({ policies: quotaPolicies.filter((_, itemIndex) => itemIndex !== index) })}><Trash2 size={13} /> 删除</button>
              </div>
              <div className="portfolio-form-grid">
                <Field label="OpenUsage provider ID" value={policy.provider_id} placeholder="例如当前快照里的 provider key" onChange={(value) => updateQuotaPolicy(index, { provider_id: String(value ?? '') })} />
                <Field label="资源 ID" value={policy.resource_id} placeholder="例如 session / weekly" onChange={(value) => updateQuotaPolicy(index, { resource_id: String(value ?? '') })} />
                <label className="portfolio-form-field">
                  <span>可结转状态</span>
                  <select className="settings-text-input" value={String(policy.rollover ?? 'unknown')} onChange={(event) => updateQuotaPolicy(index, { rollover: event.target.value as QuotaPolicy['rollover'] })}>
                    <option value="unknown">未知</option><option value="true">可结转</option><option value="false">不可结转</option>
                  </select>
                </label>
                <label className="portfolio-form-field">
                  <span>额度耗尽时</span>
                  <select className="settings-text-input" value={policy.exhausted_action ?? 'exclude'} onChange={(event) => updateQuotaPolicy(index, { exhausted_action: event.target.value as QuotaPolicy['exhausted_action'] })}>
                    <option value="exclude">排除匹配模型</option><option value="penalize">保留但降权</option>
                  </select>
                </label>
              </div>
              <Toggle label="刷新前优先利用" checked={policy.use_before_reset === true} onChange={(use_before_reset) => updateQuotaPolicy(index, { use_before_reset })} hint="只对明确标记为不可结转且有刷新时间的额度生效。" />
              <PatternList label="匹配模型规则" values={policy.match_model_keys} hint="可选；留空时按 provider ID 匹配模型渠道。" onChange={(match_model_keys) => updateQuotaPolicy(index, { match_model_keys })} />
            </div>
          ))}
        </article>

        <article className="portfolio-form-card">
          <div className="portfolio-form-card-heading">
            <div><h4>API 余额阈值</h4><p>余额单位和安全线因账号而异；只有这里明确配置的 balance 资源才会影响选模。</p></div>
            <button
              type="button"
              className="settings-secondary-button"
              onClick={() => update({ ...portfolio, balance_policies: [...balancePolicies, { provider_id: '', resource_id: '', match_model_keys: [], exhausted_action: 'penalize' }] })}
            ><Plus size={14} /> 添加余额规则</button>
          </div>
          {balancePolicies.length === 0 ? <p className="portfolio-empty-hint">未设置余额阈值；OpenUsage 显示的余额暂不参与模型排序。</p> : null}
          {balancePolicies.map((policy, index) => (
            <div className="portfolio-policy-card" key={`${policy.provider_id || 'balance'}-${policy.resource_id || index}-${index}`}>
              <div className="portfolio-policy-heading">
                <strong>余额规则 {index + 1}</strong>
                <button type="button" className="settings-danger-button" onClick={() => update({ ...portfolio, balance_policies: balancePolicies.filter((_, itemIndex) => itemIndex !== index) })}><Trash2 size={13} /> 删除</button>
              </div>
              <div className="portfolio-form-grid">
                <Field label="OpenUsage provider ID" value={policy.provider_id} placeholder="从 OpenUsage 快照读取" onChange={(value) => updateBalancePolicy(index, { provider_id: String(value ?? '') })} />
                <Field label="资源 ID" value={policy.resource_id} placeholder="只匹配 kind=balance 的资源" onChange={(value) => updateBalancePolicy(index, { resource_id: String(value ?? '') })} />
                <Field label="余额单位" value={policy.unit} placeholder="例如 USD 或 credits" onChange={(value) => updateBalancePolicy(index, { unit: value ? String(value) : undefined })} />
                <Field label="低余额阈值" type="number" min={0} step={0.01} value={policy.low_balance_threshold} onChange={(value) => updateBalancePolicy(index, { low_balance_threshold: typeof value === 'number' ? value : undefined })} />
                <Field label="低余额降权分" type="number" min={0} step={1} value={policy.low_balance_penalty_points} onChange={(value) => updateBalancePolicy(index, { low_balance_penalty_points: typeof value === 'number' ? value : undefined })} />
                <Field label="耗尽余额降权分" type="number" min={0} step={1} value={policy.exhausted_penalty_points} onChange={(value) => updateBalancePolicy(index, { exhausted_penalty_points: typeof value === 'number' ? value : undefined })} />
                <label className="portfolio-form-field">
                  <span>余额耗尽时</span>
                  <select className="settings-text-input" value={policy.exhausted_action ?? 'penalize'} onChange={(event) => updateBalancePolicy(index, { exhausted_action: event.target.value as BalancePolicy['exhausted_action'] })}>
                    <option value="penalize">保留但降权</option><option value="exclude">排除匹配模型</option>
                  </select>
                </label>
              </div>
              <PatternList label="匹配模型规则（必填）" values={policy.match_model_keys} hint="支持通配符，例如某个具体渠道的模型 key；单位和阈值请按该账号实际规则设置。" onChange={(match_model_keys) => updateBalancePolicy(index, { match_model_keys })} />
            </div>
          ))}
        </article>
      </fieldset>
    </section>
  )
}
