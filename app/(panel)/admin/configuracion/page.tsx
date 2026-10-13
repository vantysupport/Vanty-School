import { Building2, LifeBuoy } from 'lucide-react'
import { requireSession } from '@/lib/auth/session'
import { createClient } from '@/lib/supabase/server'
import { updateInstitution } from '@/lib/actions/admin'
import { Card, CardBody, CardHeader, Field, Input, PageHeader, Select, Textarea } from '@/components/ui/primitives'
import { InlineForm, SubmitButton } from '@/components/ui/dialog'

// Configuración que maneja secretaría: los datos del colegio y el protocolo ante urgencias.
// Los ajustes técnicos (proveedores de IA, límites de uso, claves del entorno) no se muestran aquí.
export default async function SettingsPage() {
  const session = await requireSession('admin')
  const db = await createClient()
  const [{ data: inst }, { data: settings }] = await Promise.all([
    db.from('institutions').select('name, rbd, dependency, commune, region').eq('id', session.institutionId).single(),
    db.from('institution_settings').select('urgent_protocol').eq('institution_id', session.institutionId).single(),
  ])

  return (
    <>
      <PageHeader title="Configuración" description="Los datos del establecimiento y a quién acudir ante una urgencia." />
      <InlineForm action={updateInstitution} resetOnSuccess={false}>
        <div className="grid items-stretch gap-4 lg:grid-cols-2">
          <Card className="flex flex-col">
            <CardHeader icon={<Building2 size={15} />} title="Establecimiento" description="Así aparece el colegio en la plataforma" />
            <CardBody className="flex-1">
              <div className="space-y-4">
                <Field label="Nombre del colegio"><Input name="name" defaultValue={inst?.name} required /></Field>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="RBD"><Input name="rbd" defaultValue={inst?.rbd ?? ''} /></Field>
                  <Field label="Dependencia">
                    <Select name="dependency" defaultValue={inst?.dependency}>
                      <option value="municipal">Municipal</option>
                      <option value="slep">Servicio Local de Educación Pública</option>
                      <option value="particular_subvencionado">Particular subvencionado</option>
                      <option value="particular_pagado">Particular pagado</option>
                    </Select>
                  </Field>
                  <Field label="Comuna"><Input name="commune" defaultValue={inst?.commune ?? ''} /></Field>
                  <Field label="Región"><Input name="region" defaultValue={inst?.region ?? ''} /></Field>
                </div>
              </div>
            </CardBody>
          </Card>

          <Card index={2} className="flex flex-col">
            <CardHeader icon={<LifeBuoy size={15} />} tone="warning" title="Ante una situación urgente" description="A quién acudir en el colegio y a qué números llamar" />
            <CardBody className="flex flex-1 flex-col">
              <Field label="Indicaciones del colegio" hint="Este texto se muestra cuando alguien plantea una situación de riesgo. La atención siempre la da una persona.">
                <Textarea name="urgent_protocol" rows={8} maxLength={2000} defaultValue={settings?.urgent_protocol ?? ''} />
              </Field>
            </CardBody>
          </Card>
        </div>
        <div className="mt-4 flex justify-end"><SubmitButton>Guardar cambios</SubmitButton></div>
      </InlineForm>
    </>
  )
}
