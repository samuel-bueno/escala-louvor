"use client";

import { useState } from "react";
import { Button, ButtonLink } from "@/components/ui/button";
import { CheckChip, Input, Select, Textarea, Toggle } from "@/components/ui/field";
import { Callout, Card } from "@/components/ui/primitives";
import { WEEKDAY_SHORT_NAMES } from "@/domain/dates";
import { useFormAction } from "@/lib/use-form-action";
import { FUNCTION_KIND_LABELS, LEVEL_LABELS } from "@/lib/validation";
import type { ActionResult } from "@/server/action-utils";
import { saveParticipantAction } from "@/server/actions/participants";

type Fn = { id: string; name: string; kind: keyof typeof FUNCTION_KIND_LABELS };
export type ParticipantFormValues = {
  id?: string;
  fullName: string;
  displayName: string;
  email: string | null;
  phone: string | null;
  level: string | null;
  monthlyLimit: number | null;
  notes: string | null;
  active: boolean;
  usualDays: number[];
  functionIds: string[];
  primaryFunctionId: string | null;
  account: { email: string; role: "admin" | "member" | "lead_instrumental" | "lead_vocal" | "lead_both" } | null;
};

export function ParticipantForm({ initial, functions, defaultLimit }: { initial: ParticipantFormValues; functions: Fn[]; defaultLimit: number }) {
  const isNew = !initial.id;
  const { state, formProps, pending, ready, fieldErrors: fe } = useFormAction<ActionResult>(saveParticipantAction.bind(null, initial.id ?? null));
  const [selected, setSelected] = useState<string[]>(initial.functionIds);
  const [primary, setPrimary] = useState(initial.primaryFunctionId ?? "");
  const [access, setAccess] = useState(!!initial.account);
  const kinds = Object.keys(FUNCTION_KIND_LABELS) as (keyof typeof FUNCTION_KIND_LABELS)[];

  return (
    <form {...formProps} className="flex flex-col gap-5">
      {state && !state.ok && (
        <Callout tone="danger" role="alert">
          {state.error}
        </Callout>
      )}
      <Card className="grid grid-cols-1 gap-4 p-4 sm:grid-cols-2 sm:p-5">
        <Input label="Nome completo" name="fullName" required autoComplete="off" defaultValue={initial.fullName} error={fe.fullName} wrapperClassName="sm:col-span-2" />
        <Input label="Nome de exibição" name="displayName" optional defaultValue={initial.displayName} error={fe.displayName} hint="Como aparece nas escalas. Padrão: primeiro nome." />
        <Select label="Experiência" name="level" optional defaultValue={initial.level ?? ""}>
          <option value="">Não informar</option>
          {Object.entries(LEVEL_LABELS).map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </Select>
        <Input label="E-mail" name="email" type="email" inputMode="email" optional defaultValue={initial.email ?? ""} error={fe.email} />
        <Input label="Telefone" name="phone" type="tel" inputMode="tel" optional defaultValue={initial.phone ?? ""} error={fe.phone} hint="Visível só para a liderança." />
      </Card>

      <Card className="p-4 sm:p-5">
        <h2 className="font-semibold">Funções e instrumentos</h2>
        <p className="mb-3 text-sm text-muted">A geração automática só escala a pessoa nas funções marcadas aqui.</p>
        {fe.functionIds && <p className="mb-2 text-sm text-danger">{fe.functionIds}</p>}
        <div className="flex flex-col gap-4">
          {kinds.map((k) => {
            const list = functions.filter((f) => f.kind === k);
            if (!list.length) return null;
            return (
              <fieldset key={k}>
                <legend className="mb-2 text-xs font-semibold tracking-wide text-muted uppercase">{FUNCTION_KIND_LABELS[k]}</legend>
                <div className="flex flex-wrap gap-2">
                  {list.map((f) => (
                    <CheckChip
                      key={f.id}
                      name="functionIds"
                      value={f.id}
                      label={f.name}
                      checked={selected.includes(f.id)}
                      onChange={(e) => setSelected((cur) => (e.target.checked ? [...cur, f.id] : cur.filter((x) => x !== f.id)))}
                    />
                  ))}
                </div>
              </fieldset>
            );
          })}
        </div>
        {selected.length > 1 && (
          <Select label="Função / instrumento principal" name="primaryFunctionId" value={selected.includes(primary) ? primary : selected[0]} onChange={(e) => setPrimary(e.target.value)} wrapperClassName="mt-4" hint="Tem leve prioridade na geração automática.">
            {functions
              .filter((f) => selected.includes(f.id))
              .map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                </option>
              ))}
          </Select>
        )}
        {selected.length === 1 && <input type="hidden" name="primaryFunctionId" value={selected[0]} />}
      </Card>

      <Card className="grid grid-cols-1 gap-4 p-4 sm:grid-cols-2 sm:p-5">
        <fieldset className="sm:col-span-2">
          <legend className="mb-2 text-sm font-semibold">
            Dias normalmente disponíveis <span className="font-normal text-muted">(opcional)</span>
          </legend>
          <div className="flex flex-wrap gap-2">
            {WEEKDAY_SHORT_NAMES.map((d, i) => (
              <CheckChip key={d} name="usualDays" value={String(i)} label={d} defaultChecked={initial.usualDays.includes(i)} />
            ))}
          </div>
          <p className="mt-1.5 text-sm text-muted">Deixe vazio se a pessoa pode em qualquer dia. É uma preferência, não um bloqueio.</p>
        </fieldset>
        <Input
          label="Limite de escalas por mês"
          name="monthlyLimit"
          type="number"
          inputMode="numeric"
          min={0}
          max={31}
          optional
          defaultValue={initial.monthlyLimit ?? ""}
          error={fe.monthlyLimit}
          hint={`Vazio = padrão do ministério (${defaultLimit}).`}
        />
        <Textarea label="Observações da liderança" name="notes" optional defaultValue={initial.notes ?? ""} error={fe.notes} hint="Visível apenas para administradores." wrapperClassName="sm:col-span-2" />
        {!isNew && <Toggle label="Ativo no ministério" description="Inativos continuam no histórico, mas não entram em novas escalas." name="active" defaultChecked={initial.active} className="sm:col-span-2" />}
      </Card>

      <Card className="p-4 sm:p-5">
        <Toggle
          label="Acesso ao aplicativo"
          description="Permite que a pessoa entre para ver escalas, confirmar presença e informar disponibilidade."
          name="createAccess"
          checked={access}
          onChange={(e) => setAccess(e.target.checked)}
        />
        {access && (
          <div className="mt-3 grid gap-4 sm:grid-cols-2">
            <Select
              label="Papel no sistema"
              name="role"
              defaultValue={initial.account?.role ?? "member"}
              hint="Não depende do instrumento que a pessoa toca. Líder dos músicos monta a banda; líder dos vocais monta os vocais e o repertório."
            >
              <option value="member">Membro (músico ou cantor)</option>
              <option value="lead_instrumental">Líder dos músicos</option>
              <option value="lead_vocal">Líder dos vocais</option>
              <option value="lead_both">Líder dos músicos e dos vocais</option>
              <option value="admin">Administrador</option>
            </Select>
            <Input
              label={initial.account ? "Nova senha" : "Senha inicial"}
              name="password"
              type="password"
              autoComplete="new-password"
              optional={!!initial.account}
              error={fe.password}
              hint={initial.account ? `Acesso atual: ${initial.account.email}. Deixe vazio para manter a senha.` : "Mínimo 8 caracteres. Use o e-mail acima como login."}
            />
          </div>
        )}
      </Card>

      <div className="action-bar">
        <ButtonLink href={initial.id ? `/pessoas/${initial.id}` : "/pessoas"} variant="ghost" className="flex-1 sm:flex-none">
          Cancelar
        </ButtonLink>
        <Button type="submit" loading={pending} disabled={!ready} className="flex-1 sm:ml-auto sm:flex-none">
          {isNew ? "Adicionar pessoa" : "Salvar alterações"}
        </Button>
      </div>
    </form>
  );
}
