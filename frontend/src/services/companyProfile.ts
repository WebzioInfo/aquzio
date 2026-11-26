import { api } from './api'

export const GALLERY_CATEGORIES = [
  { value: 'COMPANY_LOGO', label: 'Company Logo' },
  { value: 'COMPANY_COVER', label: 'Company Cover' },
  { value: 'FACTORY_EXTERIOR', label: 'Factory Exterior' },
  { value: 'PRODUCTION_FACILITY', label: 'Production Facility' },
  { value: 'MANUFACTURING_MACHINERY', label: 'Manufacturing Machinery' },
  { value: 'WATER_PURIFICATION_PLANT', label: 'Water Purification Plant' },
  { value: 'QUALITY_CONTROL_LAB', label: 'Quality Control Laboratory' },
  { value: 'BOTTLING_FACILITY', label: 'Bottling Facility' },
  { value: 'OTHER', label: 'Other Company Photos' },
] as const

export interface CompanyProfileData {
  tenantId: string
  tenantName: string
  tenantCode: string
  logoUrl?: string | null
  badgeLetters?: string | null
  licenseNumber?: string | null
  isBiodropsProduction: boolean
  displayName?: string | null
  shortDescription?: string | null
  about?: string | null
  establishedYear?: number | null
  coverImageUrl?: string | null
  publicEmail?: string | null
  publicPhone?: string | null
  websiteUrl?: string | null
  contactPerson?: string | null
  fullAddress?: string | null
  city?: string | null
  district?: string | null
  state?: string | null
  pinCode?: string | null
  googleMapsUrl?: string | null
  latitude?: number | null
  longitude?: number | null
  factoryIntroduction?: string | null
  productionFacilityDescription?: string | null
  manufacturingInfrastructure?: string | null
  qualityControlFacilities?: string | null
  isPublic: boolean
  updatedAt?: string | null
}

export interface UpdateCompanyProfilePayload {
  displayName?: string
  shortDescription?: string
  about?: string
  establishedYear?: number | null
  publicEmail?: string
  publicPhone?: string
  websiteUrl?: string
  contactPerson?: string
  fullAddress?: string
  city?: string
  district?: string
  state?: string
  pinCode?: string
  googleMapsUrl?: string
  latitude?: number | null
  longitude?: number | null
  factoryIntroduction?: string
  productionFacilityDescription?: string
  manufacturingInfrastructure?: string
  qualityControlFacilities?: string
  isPublic: boolean
}

export interface CompanyGalleryImage {
  id: string
  tenantId: string
  imageUrl: string
  category: string
  caption?: string | null
  format?: string | null
  bytes: number
  width: number
  height: number
  displayOrder: number
  isPublic: boolean
  createdAt: string
}

export const companyProfileApi = {
  getProfile: async (): Promise<CompanyProfileData> => {
    const res = await api.get('/api/v1/company/profile')
    return res.data.data
  },

  updateProfile: async (payload: UpdateCompanyProfilePayload): Promise<CompanyProfileData> => {
    const res = await api.put('/api/v1/company/profile', payload)
    return res.data.data
  },

  getGallery: async (): Promise<CompanyGalleryImage[]> => {
    const res = await api.get('/api/v1/company/gallery')
    return res.data.data || []
  },

  uploadGalleryImages: async (
    files: File[],
    category: string,
    caption: string,
    isPublic: boolean,
    onProgress?: (percent: number) => void
  ): Promise<CompanyGalleryImage[]> => {
    const formData = new FormData()
    files.forEach((file) => formData.append('files', file))
    formData.append('category', category)
    if (caption.trim()) formData.append('caption', caption.trim())
    formData.append('isPublic', String(isPublic))

    const res = await api.post('/api/v1/company/gallery/upload', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
      onUploadProgress: (evt) => {
        if (evt.total && onProgress) {
          onProgress(Math.round((evt.loaded * 100) / evt.total))
        }
      },
    })
    return res.data.data || []
  },

  updateGalleryImage: async (
    id: string,
    payload: { category?: string; caption?: string; isPublic?: boolean }
  ): Promise<CompanyGalleryImage> => {
    const res = await api.patch(`/api/v1/company/gallery/${id}`, payload)
    return res.data.data
  },

  replaceGalleryImage: async (id: string, file: File): Promise<CompanyGalleryImage> => {
    const formData = new FormData()
    formData.append('file', file)
    const res = await api.post(`/api/v1/company/gallery/${id}/replace`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
    return res.data.data
  },

  reorderGallery: async (imageIds: string[]): Promise<void> => {
    await api.put('/api/v1/company/gallery/reorder', { imageIds })
  },

  setAsCover: async (id: string): Promise<CompanyProfileData> => {
    const res = await api.post(`/api/v1/company/gallery/${id}/set-cover`)
    return res.data.data
  },

  setAsLogo: async (id: string): Promise<CompanyProfileData> => {
    const res = await api.post(`/api/v1/company/gallery/${id}/set-logo`)
    return res.data.data
  },

  deleteGalleryImage: async (id: string): Promise<void> => {
    await api.delete(`/api/v1/company/gallery/${id}`)
  },
}

