import { STORY_TEMPLATES, type StoryTemplateId } from "@/lib/templates/story-templates";

export function StoryTemplatePicker({
  value,
  onChange,
}: {
  value: StoryTemplateId | null;
  onChange: (value: StoryTemplateId | null) => void;
}) {
  const selected = STORY_TEMPLATES.find((template) => template.id === value) ?? null;

  return (
    <fieldset className="story-template-picker">
      <legend>从一个故事模板开始（可选）</legend>
      <p>模板只提供写作线索和空白字段的建议，不会覆盖你已经填写的内容。</p>
      <div className="story-template-grid">
        {STORY_TEMPLATES.map((template) => (
          <label
            key={template.id}
            className={value === template.id ? "is-selected" : ""}
          >
            <input
              type="radio"
              name="story-template"
              value={template.id}
              checked={value === template.id}
              onChange={() => onChange(template.id)}
            />
            <span>
              <strong>{template.label}</strong>
              <small>{template.summary}</small>
            </span>
          </label>
        ))}
      </div>
      {selected ? (
        <div className="story-template-guidance" aria-live="polite">
          <div>
            {selected.prompts.map((prompt) => <span key={prompt}>{prompt}</span>)}
          </div>
          <button className="quiet-button" type="button" onClick={() => onChange(null)}>
            不使用模板
          </button>
        </div>
      ) : null}
    </fieldset>
  );
}
