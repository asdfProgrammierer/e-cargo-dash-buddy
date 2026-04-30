/// <reference types="npm:@types/react@18.3.1" />
import * as React from 'npm:react@18.3.1'

export interface TemplateEntry {
  component: React.ComponentType<any>
  subject: string | ((data: Record<string, any>) => string)
  to?: string
  displayName?: string
  previewData?: Record<string, any>
}

import { template as orderNeu } from './order-neu.tsx'
import { template as orderInBearbeitung } from './order-in-bearbeitung.tsx'
import { template as orderUnterwegs } from './order-unterwegs.tsx'
import { template as orderZugestellt } from './order-zugestellt.tsx'
import { template as orderNichtZugestellt } from './order-nicht-zugestellt.tsx'
import { template as orderZustellversuchFehlgeschlagen } from './order-zustellversuch-fehlgeschlagen.tsx'

export const TEMPLATES: Record<string, TemplateEntry> = {
  'order-neu': orderNeu,
  'order-in-bearbeitung': orderInBearbeitung,
  'order-unterwegs': orderUnterwegs,
  'order-zugestellt': orderZugestellt,
  'order-nicht-zugestellt': orderNichtZugestellt,
  'order-zustellversuch-fehlgeschlagen': orderZustellversuchFehlgeschlagen,
}