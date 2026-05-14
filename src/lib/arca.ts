// ============================================================
//  INTEGRACIÓN DIRECTA CON ARCA (ex-AFIP)
//  Web Services: WSAA (autenticación) + WSFE (facturación)
//
//  REQUISITOS PREVIOS (hacer una sola vez por cliente):
//  1. El negocio debe tener CUIT con actividad en ARCA
//  2. Generar certificado digital en:
//     https://auth.afip.gob.ar/contribuyente/
//  3. Guardar el .p12 y la passphrase de forma segura
//  4. Instalar: npm install node-forge soap
// ============================================================

// ── TIPOS ────────────────────────────────────────────────────

export interface ConfigARCA {
  cuit: string              // CUIT del emisor (sin guiones)
  certPEM: string           // Certificado en formato PEM
  privateKeyPEM: string     // Clave privada en formato PEM
  puntoVenta: number        // Punto de venta habilitado en ARCA
  ambiente: 'testing' | 'produccion'
}

export interface ItemFactura {
  descripcion: string
  cantidad: number
  precio_unitario: number
  alicuota_iva: 21 | 10.5 | 0  // % de IVA
}

export interface DatosFactura {
  tipo_comprobante: 1 | 6 | 11  // 1=Factura A, 6=Factura B, 11=Factura C
  cuit_receptor?: string         // Requerido para Factura A
  nombre_receptor: string
  items: ItemFactura[]
  fecha?: string                 // YYYYMMDD, default: hoy
}

export interface ResultadoARCA {
  cae: string
  cae_vencimiento: string       // YYYYMMDD
  nro_comprobante: number
  resultado: 'A' | 'R'         // A=Aprobado, R=Rechazado
  observaciones?: string
}

// ── URLs DE LOS WEB SERVICES ─────────────────────────────────

const WSAA_URLS = {
  testing:    'https://wsaahomo.afip.gov.ar/ws/services/LoginCms',
  produccion: 'https://wsaa.afip.gov.ar/ws/services/LoginCms',
}

const WSFE_URLS = {
  testing:    'https://wswhomo.afip.gov.ar/wsfev1/service.asmx?WSDL',
  produccion: 'https://servicios1.afip.gov.ar/wsfev1/service.asmx?WSDL',
}

// ── SERVICIO ARCA ─────────────────────────────────────────────

export class ARCAService {
  private config: ConfigARCA
  private token: string | null = null
  private sign: string | null = null
  private tokenExpiry: Date | null = null

  constructor(config: ConfigARCA) {
    this.config = config
  }

  // ── 1. AUTENTICACIÓN (WSAA) ───────────────────────────────
  // Genera un Token de Acceso (TA) firmando un Ticket de Requerimiento de Acceso (TRA)

  private generarTRA(): string {
    const ahora = new Date()
    const desde = new Date(ahora.getTime() - 60000).toISOString().replace(/\.\d{3}/, '-03:00')
    const hasta = new Date(ahora.getTime() + 3600000 * 12).toISOString().replace(/\.\d{3}/, '-03:00')
    return `<?xml version="1.0" encoding="UTF-8"?>
<loginTicketRequest version="1.0">
  <header>
    <uniqueId>${Math.floor(Date.now() / 1000)}</uniqueId>
    <generationTime>${desde}</generationTime>
    <expirationTime>${hasta}</expirationTime>
  </header>
  <service>wsfe</service>
</loginTicketRequest>`
  }

  private async firmarTRA(tra: string): Promise<string> {
    // Importar node-forge dinámicamente (solo server-side)
    const forge = await import('node-forge')
    
    const cert = forge.pki.certificateFromPem(this.config.certPEM)
    const privateKey = forge.pki.privateKeyFromPem(this.config.privateKeyPEM)
    
    const p7 = forge.pkcs7.createSignedData()
    p7.content = forge.util.createBuffer(tra, 'utf8')
    p7.addCertificate(cert)
    p7.addSigner({
      key: privateKey,
      certificate: cert,
      digestAlgorithm: forge.pki.oids.sha256,
      authenticatedAttributes: [{
        type: forge.pki.oids.contentType,
        value: forge.pki.oids.data,
      }, {
        type: forge.pki.oids.messageDigest,
      }],
    })
    p7.sign()
    
    const derBuffer = forge.asn1.toDer(p7.toAsn1()).getBytes()
    return Buffer.from(derBuffer, 'binary').toString('base64')
  }

  async autenticar(): Promise<void> {
    // Si el token es válido, no reautenticar
    if (this.token && this.tokenExpiry && new Date() < this.tokenExpiry) return

    const tra = this.generarTRA()
    const cmsFirmado = await this.firmarTRA(tra)

    const soap = await import('soap')
    const client = await soap.createClientAsync(WSAA_URLS[this.config.ambiente])
    
    const [resultado] = await client.loginCmsAsync({ in0: cmsFirmado })
    const loginTicketResponse = resultado?.loginCmsReturn

    // Parsear XML de respuesta
    const tokenMatch = loginTicketResponse?.match(/<token>(.*?)<\/token>/)
    const signMatch  = loginTicketResponse?.match(/<sign>(.*?)<\/sign>/)

    if (!tokenMatch || !signMatch) throw new Error('ARCA: Error de autenticación')

    this.token = tokenMatch[1]
    this.sign  = signMatch[1]
    this.tokenExpiry = new Date(Date.now() + 3600000 * 11) // 11hs de validez
  }

  // ── 2. OBTENER ÚLTIMO NÚMERO DE COMPROBANTE ───────────────

  async obtenerUltimoComprobante(tipoComprobante: number): Promise<number> {
    await this.autenticar()
    const soap = await import('soap')
    const client = await soap.createClientAsync(WSFE_URLS[this.config.ambiente])

    const [res] = await client.FECompUltimoAutorizadoAsync({
      Auth: { Token: this.token, Sign: this.sign, Cuit: this.config.cuit },
      PtoVta: this.config.puntoVenta,
      CbteTipo: tipoComprobante,
    })

    return res?.FECompUltimoAutorizadoResult?.CbteNro ?? 0
  }

  // ── 3. EMITIR FACTURA (WSFE) ──────────────────────────────

  async emitirFactura(datos: DatosFactura): Promise<ResultadoARCA> {
    await this.autenticar()

    const ultimoNro = await this.obtenerUltimoComprobante(datos.tipo_comprobante)
    const nroComprobante = ultimoNro + 1

    const fecha = datos.fecha ?? new Date().toISOString().slice(0, 10).replace(/-/g, '')

    // Calcular IVA e importe neto
    const importeTotal = datos.items.reduce((a, i) => a + i.cantidad * i.precio_unitario, 0)
    
    // Agrupar alícuotas de IVA
    const ivaMap: Record<number, { id: number; baseImp: number; importe: number }> = {}
    datos.items.forEach(item => {
      const codigoIVA = item.alicuota_iva === 21 ? 5 : item.alicuota_iva === 10.5 ? 4 : 3
      const subtotal = item.cantidad * item.precio_unitario
      const baseNeta = subtotal / (1 + item.alicuota_iva / 100)
      const ivaImporte = subtotal - baseNeta
      if (!ivaMap[codigoIVA]) ivaMap[codigoIVA] = { id: codigoIVA, baseImp: 0, importe: 0 }
      ivaMap[codigoIVA].baseImp  += baseNeta
      ivaMap[codigoIVA].importe  += ivaImporte
    })

    const importeNeto = Object.values(ivaMap).reduce((a, v) => a + v.baseImp, 0)
    const importeIVA  = Object.values(ivaMap).reduce((a, v) => a + v.importe, 0)

    const soap = await import('soap')
    const client = await soap.createClientAsync(WSFE_URLS[this.config.ambiente])

    const request = {
      Auth: { Token: this.token, Sign: this.sign, Cuit: this.config.cuit },
      FeCAEReq: {
        FeCabReq: {
          CantReg: 1,
          PtoVta: this.config.puntoVenta,
          CbteTipo: datos.tipo_comprobante,
        },
        FeDetReq: {
          FECAEDetRequest: {
            Concepto: 1,                    // 1=Productos
            DocTipo: datos.cuit_receptor ? 80 : 99,  // 80=CUIT, 99=Consumidor final
            DocNro: datos.cuit_receptor ?? 0,
            CbteDesde: nroComprobante,
            CbteHasta: nroComprobante,
            CbteFch: fecha,
            ImpTotal: importeTotal.toFixed(2),
            ImpTotConc: 0,
            ImpNeto: importeNeto.toFixed(2),
            ImpOpEx: 0,
            ImpIVA: importeIVA.toFixed(2),
            ImpTrib: 0,
            MonId: 'PES',
            MonCotiz: 1,
            Iva: {
              AlicIva: Object.values(ivaMap).map(v => ({
                Id: v.id,
                BaseImp: v.baseImp.toFixed(2),
                Importe: v.importe.toFixed(2),
              }))
            },
          }
        }
      }
    }

    const [res] = await client.FECAESolicitudAsync(request)
    const detalle = res?.FECAESolicitudResult?.FeDetResp?.FECAEDetResponse

    if (!detalle) throw new Error('ARCA: Sin respuesta del servicio')

    if (detalle.Resultado === 'R') {
      const obs = detalle.Observaciones?.Obs?.map((o: any) => o.Msg).join(', ')
      throw new Error(`ARCA rechazó la factura: ${obs}`)
    }

    return {
      cae: detalle.CAE,
      cae_vencimiento: detalle.CAEFchVto,
      nro_comprobante: nroComprobante,
      resultado: detalle.Resultado,
      observaciones: detalle.Observaciones?.Obs?.map((o: any) => o.Msg).join(', '),
    }
  }
}

// ── FACTORIES ────────────────────────────────────────────────

/**
 * Crea instancia con config explicito — usado cuando las credenciales
 * vienen de la tabla `organizations` (cada PyME tiene las suyas).
 */
export function crearARCAServiceCon(config: ConfigARCA): ARCAService {
  return new ARCAService(config)
}

/**
 * Crea instancia desde variables de entorno — fallback / dev local.
 * Prefiri usar crearARCAServiceCon en flows multi-tenant.
 */
export function crearARCAService(ambiente: 'testing' | 'produccion' = 'testing'): ARCAService {
  return new ARCAService({
    cuit:          process.env.ARCA_CUIT!,
    certPEM:       process.env.ARCA_CERT_PEM!.replace(/\\n/g, '\n'),
    privateKeyPEM: process.env.ARCA_PRIVATE_KEY_PEM!.replace(/\\n/g, '\n'),
    puntoVenta:    parseInt(process.env.ARCA_PUNTO_VENTA ?? '1'),
    ambiente,
  })
}