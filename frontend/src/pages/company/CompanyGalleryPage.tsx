import React, { useEffect, useState, useRef } from 'react'
import { Link } from 'react-router-dom'
import {
  Upload,
  Trash2,
  Eye,
  EyeOff,
  ArrowUp,
  ArrowDown,
  Image as ImageIcon,
  Star,
  Shield,
  Loader2,
  X,
  RefreshCw,
  Building2,
} from 'lucide-react'
import PageContainer from '../../components/ui/layout/PageContainer'
import PageHeader from '../../components/ui/layout/PageHeader'
import { useNotificationStore } from '../../store/useNotificationStore'
import {
  companyProfileApi,
  type CompanyGalleryImage,
  type CompanyProfileData,
  GALLERY_CATEGORIES,
} from '../../services/companyProfile'

const ALLOWED_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp']
const MAX_BYTES = 5 * 1024 * 1024

export const CompanyGalleryPage: React.FC = () => {
  const { showToast } = useNotificationStore()
  const [images, setImages] = useState<CompanyGalleryImage[]>([])
  const [profile, setProfile] = useState<CompanyProfileData | null>(null)
  const [loading, setLoading] = useState(true)

  // Upload queue state
  const [pendingFiles, setPendingFiles] = useState<{ file: File; preview: string }[]>([])
  const [uploadCategory, setUploadCategory] = useState<string>('FACTORY_EXTERIOR')
  const [uploadCaption, setUploadCaption] = useState('')
  const [uploadIsPublic, setUploadIsPublic] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(0)
  const [isDragging, setIsDragging] = useState(false)

  // Active modals
  const [previewImage, setPreviewImage] = useState<CompanyGalleryImage | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<CompanyGalleryImage | null>(null)
  const [deleting, setDeleting] = useState(false)

  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const replaceInputRef = useRef<HTMLInputElement | null>(null)
  const [replaceTargetId, setReplaceTargetId] = useState<string | null>(null)

  const loadData = async () => {
    try {
      setLoading(true)
      const [galleryData, profileData] = await Promise.all([
        companyProfileApi.getGallery(),
        companyProfileApi.getProfile(),
      ])
      setImages(galleryData)
      setProfile(profileData)
    } catch (err: any) {
      showToast(err.message || 'Failed to load company gallery.', 'error')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [])

  const addFilesToQueue = (fileList: FileList | null) => {
    if (!fileList) return
    const valid: { file: File; preview: string }[] = []
    Array.from(fileList).forEach((file) => {
      if (!ALLOWED_TYPES.includes(file.type.toLowerCase())) {
        showToast(`Unsupported format for "${file.name}". Use JPEG, PNG, or WebP.`, 'error')
        return
      }
      if (file.size > MAX_BYTES) {
        showToast(`"${file.name}" exceeds the 5 MB limit.`, 'error')
        return
      }
      valid.push({ file, preview: URL.createObjectURL(file) })
    })
    setPendingFiles((prev) => [...prev, ...valid].slice(0, 10))
  }

  const removePending = (idx: number) => {
    setPendingFiles((prev) => {
      URL.revokeObjectURL(prev[idx].preview)
      return prev.filter((_, i) => i !== idx)
    })
  }

  const handleUpload = async () => {
    if (pendingFiles.length === 0) return
    try {
      setUploading(true)
      setUploadProgress(0)
      await companyProfileApi.uploadGalleryImages(
        pendingFiles.map((p) => p.file),
        uploadCategory,
        uploadCaption,
        uploadIsPublic,
        setUploadProgress
      )
      pendingFiles.forEach((p) => URL.revokeObjectURL(p.preview))
      setPendingFiles([])
      setUploadCaption('')
      showToast('Images uploaded successfully.', 'success')
      await loadData()
    } catch (err: any) {
      showToast(err.message || 'Image upload failed.', 'error')
    } finally {
      setUploading(false)
      setUploadProgress(0)
    }
  }

  const handleMove = async (index: number, direction: -1 | 1) => {
    const targetIdx = index + direction
    if (targetIdx < 0 || targetIdx >= images.length) return
    const reordered = [...images]
    const [moved] = reordered.splice(index, 1)
    reordered.splice(targetIdx, 0, moved)
    setImages(reordered)
    try {
      await companyProfileApi.reorderGallery(reordered.map((i) => i.id))
      showToast('Gallery order updated.', 'success')
    } catch (err: any) {
      showToast(err.message || 'Failed to reorder images.', 'error')
      loadData()
    }
  }

  const handleToggleVisibility = async (img: CompanyGalleryImage) => {
    try {
      const updated = await companyProfileApi.updateGalleryImage(img.id, {
        isPublic: !img.isPublic,
      })
      setImages((prev) => prev.map((item) => (item.id === img.id ? updated : item)))
      showToast(
        updated.isPublic ? 'Image is now visible on BIODROPS.' : 'Image hidden from public view.',
        'success'
      )
    } catch (err: any) {
      showToast(err.message || 'Failed to update visibility.', 'error')
    }
  }

  const handleUpdateMeta = async (img: CompanyGalleryImage, category: string, caption: string) => {
    try {
      const updated = await companyProfileApi.updateGalleryImage(img.id, { category, caption })
      setImages((prev) => prev.map((item) => (item.id === img.id ? updated : item)))
      showToast('Image details saved.', 'success')
    } catch (err: any) {
      showToast(err.message || 'Failed to update image.', 'error')
    }
  }

  const handleSetCover = async (id: string) => {
    try {
      const updated = await companyProfileApi.setAsCover(id)
      setProfile(updated)
      showToast('Cover image updated.', 'success')
    } catch (err: any) {
      showToast(err.message || 'Failed to set cover image.', 'error')
    }
  }

  const handleSetLogo = async (id: string) => {
    try {
      const updated = await companyProfileApi.setAsLogo(id)
      setProfile(updated)
      showToast('Company logo updated.', 'success')
    } catch (err: any) {
      showToast(err.message || 'Failed to set company logo.', 'error')
    }
  }

  const handleReplaceFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file || !replaceTargetId) return
    if (!ALLOWED_TYPES.includes(file.type.toLowerCase()) || file.size > MAX_BYTES) {
      showToast('Use a valid JPEG, PNG, or WebP image under 5 MB.', 'error')
      return
    }
    try {
      const updated = await companyProfileApi.replaceGalleryImage(replaceTargetId, file)
      setImages((prev) => prev.map((i) => (i.id === replaceTargetId ? updated : i)))
      showToast('Image replaced successfully.', 'success')
    } catch (err: any) {
      showToast(err.message || 'Failed to replace image.', 'error')
    } finally {
      setReplaceTargetId(null)
    }
  }

  const confirmDelete = async () => {
    if (!deleteTarget) return
    try {
      setDeleting(true)
      await companyProfileApi.deleteGalleryImage(deleteTarget.id)
      setImages((prev) => prev.filter((i) => i.id !== deleteTarget.id))
      setDeleteTarget(null)
      showToast('Image deleted.', 'success')
    } catch (err: any) {
      showToast(err.message || 'Failed to delete image.', 'error')
    } finally {
      setDeleting(false)
    }
  }

  return (
    <PageContainer>
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <PageHeader
          title="Company Image Gallery"
          description="Upload and organize tenant-isolated photographs for your BIODROPS public profile."
        />
        <Link
          to="/company/company-profile"
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white border border-slate-200 hover:bg-slate-50 text-slate-800 text-xs font-semibold transition-colors self-start"
        >
          <Building2 className="w-4 h-4" />
          Edit Company Profile
        </Link>
      </div>

      {/* Upload Dropzone */}
      <div className="mt-6 bg-white border border-slate-200 rounded-2xl p-6 shadow-xs space-y-5">
        <div
          onDragOver={(e) => {
            e.preventDefault()
            setIsDragging(true)
          }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={(e) => {
            e.preventDefault()
            setIsDragging(false)
            addFilesToQueue(e.dataTransfer.files)
          }}
          onClick={() => fileInputRef.current?.click()}
          className={`border-2 border-dashed rounded-2xl p-8 text-center cursor-pointer transition-colors ${
            isDragging
              ? 'border-teal-500 bg-teal-50/50'
              : 'border-slate-200 hover:border-teal-400 bg-slate-50/60'
          }`}
        >
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={(e) => {
              addFilesToQueue(e.target.files)
              e.target.value = ''
            }}
          />
          <Upload className="w-8 h-8 text-teal-600 mx-auto mb-3" />
          <p className="text-sm font-semibold text-slate-800">
            Drag &amp; drop facility photographs here, or click to browse
          </p>
          <p className="text-xs text-slate-500 mt-1">
            JPEG, PNG, or WebP up to 5 MB each (max 10 per upload)
          </p>
        </div>

        {/* Upload Options & Queue */}
        {pendingFiles.length > 0 && (
          <div className="space-y-4 pt-2 border-t border-slate-100">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">
                  Category
                </label>
                <select
                  value={uploadCategory}
                  onChange={(e) => setUploadCategory(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm"
                >
                  {GALLERY_CATEGORIES.map((cat) => (
                    <option key={cat.value} value={cat.value}>
                      {cat.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">
                  Caption (optional)
                </label>
                <input
                  type="text"
                  maxLength={300}
                  value={uploadCaption}
                  onChange={(e) => setUploadCaption(e.target.value)}
                  placeholder="e.g. RO Purification Unit"
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm"
                />
              </div>
              <div className="flex items-end gap-3">
                <label className="inline-flex items-center gap-2 text-xs font-semibold text-slate-700 cursor-pointer pb-2">
                  <input
                    type="checkbox"
                    checked={uploadIsPublic}
                    onChange={(e) => setUploadIsPublic(e.target.checked)}
                    className="rounded border-slate-300"
                  />
                  Public on BIODROPS
                </label>
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-5 gap-3">
              {pendingFiles.map((item, idx) => (
                <div key={idx} className="relative rounded-xl overflow-hidden border border-slate-200 aspect-square bg-slate-100">
                  <img src={item.preview} alt="" className="w-full h-full object-cover" />
                  <button
                    type="button"
                    onClick={() => removePending(idx)}
                    className="absolute top-1.5 right-1.5 p-1 rounded-full bg-black/70 text-white hover:bg-black"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>

            {uploading && (
              <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
                <div
                  className="bg-teal-600 h-2 transition-all duration-200"
                  style={{ width: `${uploadProgress}%` }}
                />
              </div>
            )}

            <div className="flex justify-end">
              <button
                type="button"
                disabled={uploading}
                onClick={handleUpload}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-xs font-semibold disabled:opacity-50 cursor-pointer"
              >
                {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                {uploading ? `Uploading (${uploadProgress}%)` : `Upload ${pendingFiles.length} Image(s)`}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Hidden Replace Input */}
      <input
        ref={replaceInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={handleReplaceFile}
      />

      {/* Gallery Grid */}
      <div className="mt-6">
        {loading ? (
          <div className="flex items-center justify-center py-20 text-slate-500 gap-2">
            <Loader2 className="w-5 h-5 animate-spin" />
            <span className="text-sm">Loading gallery...</span>
          </div>
        ) : images.length === 0 ? (
          <div className="bg-white border border-slate-200 rounded-2xl p-12 text-center">
            <ImageIcon className="w-10 h-10 text-slate-300 mx-auto mb-3" />
            <h3 className="text-sm font-semibold text-slate-800">No Gallery Images Yet</h3>
            <p className="text-xs text-slate-500 mt-1">
              Upload your factory exterior, bottling line, and laboratory photos above.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
            {images.map((img, index) => {
              const isCover = profile?.coverImageUrl === img.imageUrl
              const isLogo = profile?.logoUrl === img.imageUrl

              return (
                <div
                  key={img.id}
                  className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-xs flex flex-col"
                >
                  <div
                    onClick={() => setPreviewImage(img)}
                    className="relative aspect-[16/10] bg-slate-100 cursor-pointer group overflow-hidden"
                  >
                    <img
                      src={img.imageUrl}
                      alt={img.caption || img.category}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                    />
                    <div className="absolute top-2.5 left-2.5 flex flex-wrap gap-1.5">
                      {isCover && (
                        <span className="px-2 py-0.5 rounded-full bg-teal-600 text-white text-[10px] font-bold uppercase">
                          Cover
                        </span>
                      )}
                      {isLogo && (
                        <span className="px-2 py-0.5 rounded-full bg-slate-900 text-white text-[10px] font-bold uppercase">
                          Logo
                        </span>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation()
                        handleToggleVisibility(img)
                      }}
                      className={`absolute top-2.5 right-2.5 px-2.5 py-1 rounded-full text-[10px] font-bold inline-flex items-center gap-1 ${
                        img.isPublic
                          ? 'bg-emerald-600 text-white'
                          : 'bg-slate-800/80 text-white'
                      }`}
                    >
                      {img.isPublic ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
                      {img.isPublic ? 'Public' : 'Private'}
                    </button>
                  </div>

                  <div className="p-4 space-y-3 flex-1 flex flex-col">
                    <select
                      value={img.category}
                      onChange={(e) => handleUpdateMeta(img, e.target.value, img.caption || '')}
                      className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 text-xs font-medium text-slate-700"
                    >
                      {GALLERY_CATEGORIES.map((cat) => (
                        <option key={cat.value} value={cat.value}>
                          {cat.label}
                        </option>
                      ))}
                    </select>

                    <input
                      type="text"
                      defaultValue={img.caption || ''}
                      placeholder="Add caption..."
                      onBlur={(e) => {
                        if (e.target.value !== (img.caption || '')) {
                          handleUpdateMeta(img, img.category, e.target.value)
                        }
                      }}
                      className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 text-xs text-slate-800"
                    />

                    <div className="flex flex-wrap items-center justify-between gap-1.5 pt-2 mt-auto border-t border-slate-100">
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          disabled={index === 0}
                          onClick={() => handleMove(index, -1)}
                          title="Move up"
                          className="p-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 disabled:opacity-40 cursor-pointer"
                        >
                          <ArrowUp className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          disabled={index === images.length - 1}
                          onClick={() => handleMove(index, 1)}
                          title="Move down"
                          className="p-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 disabled:opacity-40 cursor-pointer"
                        >
                          <ArrowDown className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setReplaceTargetId(img.id)
                            replaceInputRef.current?.click()
                          }}
                          title="Replace image"
                          className="p-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 cursor-pointer"
                        >
                          <RefreshCw className="w-3.5 h-3.5" />
                        </button>
                      </div>

                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => handleSetCover(img.id)}
                          className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-teal-50 hover:bg-teal-100 text-teal-700 text-[11px] font-semibold cursor-pointer"
                        >
                          <Star className="w-3 h-3" />
                          Cover
                        </button>
                        <button
                          type="button"
                          onClick={() => handleSetLogo(img.id)}
                          className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-800 text-[11px] font-semibold cursor-pointer"
                        >
                          <Shield className="w-3 h-3" />
                          Logo
                        </button>
                        <button
                          type="button"
                          onClick={() => setDeleteTarget(img)}
                          title="Delete image"
                          className="p-1.5 rounded-lg bg-red-50 hover:bg-red-100 text-red-600 cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Preview Modal */}
      {previewImage && (
        <div
          onClick={() => setPreviewImage(null)}
          className="fixed inset-0 z-50 bg-black/85 flex items-center justify-center p-4"
        >
          <button
            type="button"
            onClick={() => setPreviewImage(null)}
            className="absolute top-4 right-4 p-2 rounded-full bg-white/10 text-white"
          >
            <X className="w-5 h-5" />
          </button>
          <img
            src={previewImage.imageUrl}
            alt={previewImage.caption || ''}
            className="max-w-full max-h-[85vh] rounded-xl object-contain"
          />
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl p-6 max-w-sm w-full space-y-4 shadow-xl">
            <h3 className="text-base font-semibold text-slate-900">Delete Gallery Image?</h3>
            <p className="text-xs text-slate-600">
              This will permanently remove the photograph from your company gallery and BIODROPS public profile.
            </p>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setDeleteTarget(null)}
                className="px-4 py-2 rounded-xl border border-slate-200 text-xs font-semibold text-slate-700"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={deleting}
                onClick={confirmDelete}
                className="px-4 py-2 rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs font-semibold disabled:opacity-50"
              >
                {deleting ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </PageContainer>
  )
}

export default CompanyGalleryPage

