import type { Count } from '../domain/research'
import type { ProviderResult, VolumeData, ExpansionData } from './contracts'
export interface SearchAdRow {
  keyword: string
  pc: Count
  mobile: Count
  total: Count
}
export interface SearchAdResponse {
  volume: ProviderResult<VolumeData>
  expansion: ProviderResult<ExpansionData>
  rows: SearchAdRow[]
  cached: boolean
}
