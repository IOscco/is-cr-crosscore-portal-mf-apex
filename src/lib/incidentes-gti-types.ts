export interface GtiTicketRawDto {
  id?: number | null;
  category?: string | null;
  system?: string | null;
  currentStatus?: string | null;
  currentUserLogin?: string | null;
  currentUserName?: string | null;
  currentUserEmail?: string | null;
  resolverUser?: string | null;
  createdAt?: string | null;
  lastStatusAt?: string | null;
  title?: string | null;
  area?: string | null;
  subcategory?: string | null;
  description?: string | null;
  gti?: string | number | null;
  subcategoria?: string | null;
  sistema?: string | null;
  estadoactual?: string | null;
  codusuarioactual?: string | null;
  usuarioactual?: string | null;
  Cod_UsuarioResolutor?: string | null;
  UsuarioResolutor?: string | null;
  fec_registro?: string | null;
  fec_ultimoestado?: string | null;
  areausuarioregistro?: string | null;
  gls_descripcion?: string | null;
  gls_titulo?: string | null;
  es_soporte?: string | boolean | null;
  patron_squad?: string | null;
  'TPO / Lead'?: string | null;
  [key: string]: unknown;
}

export interface GtiTicket {
  gti: string;
  subcategoria: string | null;
  sistema: string | null;
  estadoActual: string | null;
  usuarioActual: string | null;
  usuarioActualLogin: string | null;
  usuarioActualEmail: string | null;
  usuarioResolutor: string | null;
  fechaRegistro: string | null;
  fechaUltimoEstado: string | null;
  area: string | null;
  descripcion: string | null;
  titulo: string | null;
  soporteNegocio: boolean;
  patronSquad: string | null;
  tpoLeadGti: string | null;
  squad: string | null;
  tpo: string | null;
}

export interface GtiTicketListResponse {
  items?: GtiTicketRawDto[];
  meta?: {
    total: number;
    category: string;
    startDate: string;
    endDate: string;
  };
}
