import { useState } from "react";
import { RotateCcw, Wrench, Save } from "lucide-react";
import { useDevBypass } from "../../config/DevBypassContext";
import { Alert, Button, Input, Tag as Pill } from "../components";

const PRESETS: Array<{
  label: string;
  state: string;
  schoolId: string;
  tone: "palm" | "tan" | "maroon";
}> = [
  {
    label: "نشط",
    state: "Active",
    schoolId: "11111111-1111-1111-1111-111111111111",
    tone: "palm",
  },
  {
    label: "مهلة التجديد",
    state: "GracePeriod",
    schoolId: "22222222-2222-2222-2222-222222222222",
    tone: "tan",
  },
  {
    label: "منتهي الصلاحية",
    state: "Expired",
    schoolId: "33333333-3333-3333-3333-333333333333",
    tone: "maroon",
  },
  {
    label: "موقوف",
    state: "Suspended",
    schoolId: "44444444-4444-4444-4444-444444444444",
    tone: "maroon",
  },
];

const DEFAULT = {
  enabled: true,
  schoolId: "11111111-1111-1111-1111-111111111111",
  userId: "22222222-2222-2222-2222-222222222222",
};

export function DevSettingsPanel(): JSX.Element {
  const { config, setConfig } = useDevBypass();
  const [open, setOpen] = useState(false);
  const [schoolId, setSchoolId] = useState(config.schoolId);
  const [userId, setUserId] = useState(config.userId);

  const apply = (): void => {
    setConfig({ ...config, schoolId, userId });
  };

  return (
    <div className="flex w-full flex-col items-stretch gap-2 md:w-auto md:items-end">
      <Button
        variant="secondary"
        size="sm"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        leadingIcon={<Wrench className="h-3.5 w-3.5" aria-hidden="true" />}
      >
        {open ? "إخفاء إعدادات المطور" : "إعدادات المطور"}
      </Button>
      {open && (
        <div
          role="region"
          aria-label="إعدادات المطور"
          className="asa-card flex w-full max-w-md flex-col gap-5 p-5 animate-fade-in"
        >
          <Alert variant="info" title="وضع التطوير">
            هذه اللوحة مفعّلة في بيئة التطوير فقط. تستخدم قيم معرف المدرسة
            ومعرف المستخدم بدلاً من رمز JWT. اضغط على إحدى الحالات أدناه
            لتجربة سلوك كل حالة اشتراك.
          </Alert>

          <div>
            <div className="asa-eyebrow mb-2">الحالات الجاهزة</div>
            <div className="flex flex-wrap gap-1.5">
              {PRESETS.map((preset) => (
                <button
                  key={preset.schoolId}
                  type="button"
                  onClick={() => {
                    setConfig({ ...config, schoolId: preset.schoolId });
                    setSchoolId(preset.schoolId);
                  }}
                  className="transition-transform duration-180 ease-out-expo active:scale-[0.985]"
                >
                  <Pill tone={preset.tone}>{preset.label}</Pill>
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="flex flex-col gap-1.5">
              <span className="font-kufi text-[10px] uppercase tracking-[0.18em] text-ink-soft">
                معرف المدرسة (UUID)
              </span>
              <Input
                size="md"
                value={schoolId}
                onChange={(e) => setSchoolId(e.target.value)}
                dir="ltr"
                className="font-mono"
              />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="font-kufi text-[10px] uppercase tracking-[0.18em] text-ink-soft">
                معرف المستخدم (UUID)
              </span>
              <Input
                size="md"
                value={userId}
                onChange={(e) => setUserId(e.target.value)}
                dir="ltr"
                className="font-mono"
              />
            </label>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="primary"
              size="sm"
              onClick={apply}
              leadingIcon={<Save className="h-3.5 w-3.5" aria-hidden="true" />}
            >
              تطبيق
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setConfig(DEFAULT);
                setSchoolId(DEFAULT.schoolId);
                setUserId(DEFAULT.userId);
              }}
              leadingIcon={
                <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
              }
            >
              إعادة الافتراضي
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
