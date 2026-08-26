/**
 * Types de la base CRM Altitude.
 * Régénérable : `supabase gen types typescript --project-id cwnxcckclbinhsxipowh`
 */

export type UserRole = 'admin' | 'setter' | 'closer'
export type IcpStatus = 'inconnu' | 'icp' | 'hors_icp'
export type ActivityType = 'appel' | 'dm_linkedin' | 'whatsapp' | 'sms' | 'email' | 'note'
export type ActivityDirection = 'entrant' | 'sortant' | 'interne'
export type AppointmentKind = 'setting' | 'closing' | 'suivi'
export type AppointmentStatus = 'planifie' | 'honore' | 'no_show' | 'replanifie' | 'annule'
export type PaymentPlan = '1x' | '2x' | '3x' | '4x' | 'autre'
export type PaymentProcessor = 'mollie' | 'stripe' | 'virement' | 'especes' | 'autre'
export type LegalEntity = 'auto' | 'sasu'
export type TaskStatus = 'a_faire' | 'fait' | 'annule'
export type PaymentStatus = 'attendu' | 'encaisse' | 'echoue' | 'rembourse' | 'annule'

export type Profile = {
  id: string
  full_name: string
  email: string
  role: UserRole
  is_active: boolean
  created_at: string
  updated_at: string
}

export type ConfigRow = {
  id: string
  key: string
  label: string
  position: number
  is_active: boolean
  created_at: string
}

export type PipelineStage = ConfigRow & {
  is_won: boolean
  is_lost: boolean
}

export type Source = ConfigRow
export type LostReason = ConfigRow

export type Contact = {
  id: string
  full_name: string
  email: string | null
  phone: string | null
  company: string | null
  main_pain: string | null
  icp: IcpStatus
  source_id: string | null
  consent_marketing: boolean
  consent_at: string | null
  owner_id: string | null
  notes: string | null
  created_by: string | null
  created_at: string
  updated_at: string
}

export type Opportunity = {
  id: string
  contact_id: string
  stage_id: string
  source_id: string | null
  setter_id: string | null
  closer_id: string | null
  amount_proposed: number | null
  amount_signed: number | null        // référence du dashboard : hors taxes
  amount_ht: number | null
  amount_ttc: number | null
  setter_commission_pct: number | null
  payment_plan: PaymentPlan | null
  payment_processor: PaymentProcessor | null
  legal_entity: LegalEntity | null
  setter_paid: boolean
  is_no_show: boolean
  is_nurturing: boolean
  is_disqualified: boolean
  lost_reason_id: string | null
  lost_note: string | null
  won_at: string | null
  lost_at: string | null
  created_by: string | null
  created_at: string
  updated_at: string
}

export type Activity = {
  id: string
  opportunity_id: string | null
  contact_id: string
  type: ActivityType
  direction: ActivityDirection
  outcome: string | null
  content: string | null
  // Le lien se vide si le compte est supprimé ; author_name garde la trace.
  author_id: string | null
  author_name: string
  occurred_at: string
  created_at: string
}

export type Appointment = {
  id: string
  opportunity_id: string
  contact_id: string
  kind: AppointmentKind
  scheduled_at: string
  duration_min: number
  status: AppointmentStatus
  host_id: string | null
  location: string | null
  notes: string | null
  rescheduled_to: string | null
  created_by: string | null
  created_at: string
  updated_at: string
}

export type RelanceRule = {
  id: string
  label: string
  delai_jours: number
  position: number
  is_active: boolean
  created_at: string
}

export type Task = {
  id: string
  opportunity_id: string | null
  contact_id: string | null
  title: string
  details: string | null
  due_at: string
  assignee_id: string | null
  status: TaskStatus
  completed_at: string | null
  created_by: string | null
  relance_rule_id: string | null
  created_at: string
  updated_at: string
}

export type StageTransition = {
  id: number
  opportunity_id: string
  from_stage_id: string | null
  to_stage_id: string
  changed_by: string | null
  changed_at: string
  seconds_in_previous_stage: number | null
}

export type FunnelRow = {
  position: number
  key: string
  label: string
  reached: number
}

export type OpportunityReach = {
  opportunity_id: string
  contact_id: string
  source_id: string | null
  setter_id: string | null
  closer_id: string | null
  created_at: string
  won_at: string | null
  lost_at: string | null
  amount_signed: number | null
  is_disqualified: boolean
  max_position_reached: number
}

export type Payment = {
  id: string
  opportunity_id: string
  installment_no: number
  due_date: string
  amount_expected: number
  amount_received: number | null
  received_at: string | null
  status: PaymentStatus
  method: string | null
  processor: PaymentProcessor | null
  legal_entity: LegalEntity | null
  external_ref: string | null
  created_at: string
  updated_at: string
}

export type SaleRow = {
  opportunity_id: string
  contact_id: string
  full_name: string
  company: string | null
  source: string | null
  closer: string | null
  amount_signed: number | null
  payment_plan: PaymentPlan | null
  payment_processor: PaymentProcessor | null
  legal_entity: LegalEntity | null
  setter_paid: boolean
  won_at: string
  cycle_days: number | null
}

export type ShowRateRow = {
  kind: AppointmentKind
  month: string
  host_id: string | null
  rdv_aboutis: number
  honores: number
  show_rate_pct: number | null
}

type Table<R, I = Partial<R>, U = Partial<R>> = {
  Row: R
  Insert: I
  Update: U
  Relationships: []
}

type Vue<R> = {
  Row: R
  Relationships: []
}

export type Database = {
  __InternalSupabase: { PostgrestVersion: '14.15' }
  public: {
    Tables: {
      profiles: Table<Profile, Partial<Profile> & Pick<Profile, 'id' | 'full_name' | 'email'>>
      pipeline_stages: Table<PipelineStage, Partial<PipelineStage> & Pick<PipelineStage, 'key' | 'label' | 'position'>>
      sources: Table<Source, Partial<Source> & Pick<Source, 'key' | 'label'>>
      lost_reasons: Table<LostReason, Partial<LostReason> & Pick<LostReason, 'key' | 'label'>>
      contacts: Table<Contact, Partial<Contact> & Pick<Contact, 'full_name'>>
      opportunities: Table<Opportunity, Partial<Opportunity> & Pick<Opportunity, 'contact_id' | 'stage_id'>>
      activities: Table<Activity, Partial<Activity> & Pick<Activity, 'contact_id' | 'type'>>
      appointments: Table<Appointment, Partial<Appointment> & Pick<Appointment, 'opportunity_id' | 'contact_id' | 'kind' | 'scheduled_at'>>
      tasks: Table<Task, Partial<Task> & Pick<Task, 'title' | 'due_at'>>
      relance_rules: Table<RelanceRule, Partial<RelanceRule> & Pick<RelanceRule, 'label' | 'delai_jours'>>
      payments: Table<Payment, Partial<Payment> & Pick<Payment, 'opportunity_id' | 'due_date' | 'amount_expected'>>
      stage_transitions: Table<StageTransition, Partial<StageTransition> & Pick<StageTransition, 'opportunity_id' | 'to_stage_id'>>
    }
    Views: {
      v_funnel: Vue<FunnelRow>
      v_opportunity_reach: Vue<OpportunityReach>
      v_sales: Vue<SaleRow>
      v_show_rate: Vue<ShowRateRow>
    }
    Functions: {
      is_admin: { Args: Record<string, never>; Returns: boolean }
      current_role_name: { Args: Record<string, never>; Returns: UserRole }
    }
    Enums: {
      user_role: UserRole
      icp_status: IcpStatus
      activity_type: ActivityType
      activity_direction: ActivityDirection
      appointment_kind: AppointmentKind
      appointment_status: AppointmentStatus
      payment_plan: PaymentPlan
      task_status: TaskStatus
      payment_status: PaymentStatus
    }
    CompositeTypes: Record<string, never>
  }
}
