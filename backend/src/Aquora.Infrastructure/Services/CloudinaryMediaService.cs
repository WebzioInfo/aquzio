using System;
using System.IO;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using CloudinaryDotNet;
using CloudinaryDotNet.Actions;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using Aquora.Application.DTOs.Media;
using Aquora.Application.Interfaces.Services;
using Aquora.Infrastructure.Configuration;

namespace Aquora.Infrastructure.Services
{
    public class CloudinaryMediaService : ICloudinaryMediaService
    {
        private readonly Cloudinary _cloudinary;
        private readonly ILogger<CloudinaryMediaService> _logger;
        private readonly CloudinaryOptions _options;

        private static readonly string[] AllowedImageMimeTypes = new[]
        {
            "image/jpeg",
            "image/jpg",
            "image/png",
            "image/webp",
            "image/gif",
            "image/svg+xml"
        };

        private static readonly string[] AllowedRawMimeTypes = new[]
        {
            "application/pdf",
            "application/msword",
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            "application/vnd.ms-excel",
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            "text/plain",
            "text/csv"
        };

        private const long MaxImageSizeBytes = 5 * 1024 * 1024; // 5 MB
        private const long MaxRawFileSizeBytes = 15 * 1024 * 1024; // 15 MB

        public CloudinaryMediaService(
            IOptions<CloudinaryOptions> options,
            ILogger<CloudinaryMediaService> logger)
        {
            _options = options.Value;
            _logger = logger;

            if (_options.IsConfigured)
            {
                var account = new Account(
                    _options.CloudName,
                    _options.ApiKey,
                    _options.ApiSecret);

                _cloudinary = new Cloudinary(account);
                _cloudinary.Api.Secure = true;
            }
            else
            {
                _logger.LogWarning("[CloudinaryMediaService]: Cloudinary credentials are not fully configured.");
                _cloudinary = new Cloudinary();
            }
        }

        public async Task<CloudinaryUploadResult> UploadImageAsync(
            Stream fileStream,
            string fileName,
            string contentType,
            MediaAssetType assetType,
            Guid? tenantId = null,
            Guid? userId = null,
            CancellationToken cancellationToken = default)
        {
            if (!_options.IsConfigured)
            {
                throw new InvalidOperationException("Cloudinary media storage is not configured on this server.");
            }

            if (fileStream == null || fileStream.Length == 0)
            {
                throw new ArgumentException("Uploaded file stream is empty.", nameof(fileStream));
            }

            if (fileStream.Length > MaxImageSizeBytes)
            {
                throw new InvalidOperationException($"Image size exceeds the maximum allowed limit of {MaxImageSizeBytes / (1024 * 1024)} MB.");
            }

            // Validate MIME type
            var normalizedContentType = contentType?.ToLowerInvariant().Trim() ?? string.Empty;
            if (!AllowedImageMimeTypes.Contains(normalizedContentType))
            {
                // Fallback check extension
                var ext = Path.GetExtension(fileName)?.ToLowerInvariant();
                if (ext != ".jpg" && ext != ".jpeg" && ext != ".png" && ext != ".webp" && ext != ".gif" && ext != ".svg")
                {
                    throw new InvalidOperationException($"Unsupported image format '{contentType}'. Allowed formats: JPG, PNG, WebP, GIF, SVG.");
                }
            }

            // Inspect magic bytes for image safety (unless SVG)
            if (!normalizedContentType.Contains("svg") && !fileName.EndsWith(".svg", StringComparison.OrdinalIgnoreCase))
            {
                ValidateImageMagicBytes(fileStream);
            }

            var folder = BuildFolderPath(assetType, tenantId, userId);
            var sanitizedFileName = Path.GetFileNameWithoutExtension(fileName)
                .Replace(" ", "_")
                .Replace("-", "_");
            if (string.IsNullOrWhiteSpace(sanitizedFileName)) sanitizedFileName = "media";

            var publicId = $"{folder}/{sanitizedFileName}_{Guid.NewGuid():N}";

            // Configure Cloudinary upload parameters
            var uploadParams = new ImageUploadParams
            {
                File = new FileDescription(fileName, fileStream),
                PublicId = publicId,
                UseFilename = false,
                UniqueFilename = false,
                Overwrite = true
            };

            // Apply sensible default transformations per asset type
            switch (assetType)
            {
                case MediaAssetType.UserProfilePhoto:
                case MediaAssetType.QcProfilePhoto:
                    uploadParams.Transformation = new Transformation()
                        .Width(400).Height(400).Crop("fill").Gravity("face").Quality("auto").FetchFormat("auto");
                    break;

                case MediaAssetType.CompanyLogo:
                    uploadParams.Transformation = new Transformation()
                        .Width(800).Height(800).Crop("limit").Quality("auto").FetchFormat("auto");
                    break;

                case MediaAssetType.CompanyCover:
                    uploadParams.Transformation = new Transformation()
                        .Width(1920).Height(1080).Crop("limit").Quality("auto").FetchFormat("auto");
                    break;

                case MediaAssetType.CompanyGallery:
                    uploadParams.Transformation = new Transformation()
                        .Width(1600).Height(1200).Crop("limit").Quality("auto").FetchFormat("auto");
                    break;

                case MediaAssetType.QcSignature:
                    uploadParams.Transformation = new Transformation()
                        .Width(600).Height(300).Crop("limit").Quality("auto").FetchFormat("auto");
                    break;

                default:
                    uploadParams.Transformation = new Transformation()
                        .Quality("auto").FetchFormat("auto");
                    break;
            }

            _logger.LogInformation("[CloudinaryMediaService]: Uploading image to folder {Folder}, AssetType: {AssetType}", folder, assetType);

            var uploadResult = await _cloudinary.UploadAsync(uploadParams, cancellationToken);

            if (uploadResult.Error != null)
            {
                _logger.LogError("[CloudinaryMediaService]: Upload failed with message: {Message}", uploadResult.Error.Message);
                throw new InvalidOperationException($"Failed to upload media asset to storage provider: {uploadResult.Error.Message}");
            }

            var resultUrl = uploadResult.SecureUrl?.ToString() ?? uploadResult.Url?.ToString() ?? string.Empty;

            return new CloudinaryUploadResult
            {
                Url = resultUrl,
                PublicId = uploadResult.PublicId,
                Format = uploadResult.Format,
                Bytes = uploadResult.Bytes,
                Width = uploadResult.Width,
                Height = uploadResult.Height,
                ResourceType = uploadResult.ResourceType ?? "image",
                CreatedAt = uploadResult.CreatedAt
            };
        }

        public async Task<CloudinaryUploadResult> UploadRawFileAsync(
            Stream fileStream,
            string fileName,
            string contentType,
            MediaAssetType assetType,
            Guid? tenantId = null,
            Guid? userId = null,
            CancellationToken cancellationToken = default)
        {
            if (!_options.IsConfigured)
            {
                throw new InvalidOperationException("Cloudinary media storage is not configured on this server.");
            }

            if (fileStream == null || fileStream.Length == 0)
            {
                throw new ArgumentException("Uploaded file stream is empty.", nameof(fileStream));
            }

            if (fileStream.Length > MaxRawFileSizeBytes)
            {
                throw new InvalidOperationException($"File size exceeds the maximum allowed limit of {MaxRawFileSizeBytes / (1024 * 1024)} MB.");
            }

            var folder = BuildFolderPath(assetType, tenantId, userId);
            var sanitizedFileName = Path.GetFileNameWithoutExtension(fileName)
                .Replace(" ", "_")
                .Replace("-", "_");
            if (string.IsNullOrWhiteSpace(sanitizedFileName)) sanitizedFileName = "document";

            var publicId = $"{folder}/{sanitizedFileName}_{Guid.NewGuid():N}";

            var uploadParams = new RawUploadParams
            {
                File = new FileDescription(fileName, fileStream),
                PublicId = publicId,
                UseFilename = false,
                UniqueFilename = false,
                Overwrite = true
            };

            _logger.LogInformation("[CloudinaryMediaService]: Uploading raw file to folder {Folder}, AssetType: {AssetType}", folder, assetType);

            var uploadResult = await _cloudinary.UploadAsync(uploadParams, "raw", cancellationToken);

            if (uploadResult.Error != null)
            {
                _logger.LogError("[CloudinaryMediaService]: Raw upload failed: {Message}", uploadResult.Error.Message);
                throw new InvalidOperationException($"Failed to upload document to storage provider: {uploadResult.Error.Message}");
            }

            var resultUrl = uploadResult.SecureUrl?.ToString() ?? uploadResult.Url?.ToString() ?? string.Empty;

            return new CloudinaryUploadResult
            {
                Url = resultUrl,
                PublicId = uploadResult.PublicId,
                Format = uploadResult.Format ?? Path.GetExtension(fileName)?.TrimStart('.') ?? string.Empty,
                Bytes = uploadResult.Bytes,
                ResourceType = uploadResult.ResourceType ?? "raw",
                CreatedAt = uploadResult.CreatedAt
            };
        }

        public async Task<bool> DeleteAssetAsync(
            string publicId,
            string resourceType = "image",
            CancellationToken cancellationToken = default)
        {
            if (!_options.IsConfigured || string.IsNullOrWhiteSpace(publicId))
            {
                return false;
            }

            try
            {
                var rType = resourceType?.ToLowerInvariant() == "raw" ? ResourceType.Raw : ResourceType.Image;
                var delParams = new DeletionParams(publicId)
                {
                    ResourceType = rType
                };

                var delResult = await _cloudinary.DestroyAsync(delParams);
                var isSuccess = delResult.Result?.Equals("ok", StringComparison.OrdinalIgnoreCase) == true;
                _logger.LogInformation("[CloudinaryMediaService]: Deleted asset {PublicId}, Result: {Result}", publicId, delResult.Result);
                return isSuccess;
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "[CloudinaryMediaService]: Failed to delete asset {PublicId}: {Message}", publicId, ex.Message);
                return false;
            }
        }

        public string GetTransformedImageUrl(
            string publicId,
            int? width = null,
            int? height = null,
            string crop = "fill",
            string gravity = "auto",
            string format = "auto",
            string quality = "auto")
        {
            if (string.IsNullOrWhiteSpace(publicId)) return string.Empty;

            var transformation = new Transformation();
            if (width.HasValue) transformation = transformation.Width(width.Value);
            if (height.HasValue) transformation = transformation.Height(height.Value);
            if (!string.IsNullOrWhiteSpace(crop)) transformation = transformation.Crop(crop);
            if (!string.IsNullOrWhiteSpace(gravity)) transformation = transformation.Gravity(gravity);
            if (!string.IsNullOrWhiteSpace(format)) transformation = transformation.FetchFormat(format);
            if (!string.IsNullOrWhiteSpace(quality)) transformation = transformation.Quality(quality);

            return _cloudinary.Api.UrlImgUp.Transform(transformation).BuildUrl(publicId);
        }

        public string BuildFolderPath(MediaAssetType assetType, Guid? tenantId, Guid? userId)
        {
            string tenantSegment = tenantId.HasValue && tenantId.Value != Guid.Empty
                ? $"tenants/{tenantId.Value}"
                : "platform";

            string userSegment = userId.HasValue && userId.Value != Guid.Empty
                ? userId.Value.ToString()
                : "common";

            return assetType switch
            {
                MediaAssetType.UserProfilePhoto => $"aquzio/{tenantSegment}/users/{userSegment}/profile",
                MediaAssetType.CompanyLogo => $"aquzio/{tenantSegment}/company/logo",
                MediaAssetType.CompanyCover => $"aquzio/{tenantSegment}/company/cover",
                MediaAssetType.CompanyGallery => $"aquzio/{tenantSegment}/company/gallery",
                MediaAssetType.QcSignature => $"aquzio/{tenantSegment}/qc/{userSegment}/signature",
                MediaAssetType.QcProfilePhoto => $"aquzio/{tenantSegment}/qc/{userSegment}/profile",
                MediaAssetType.Document => $"aquzio/{tenantSegment}/documents",
                MediaAssetType.Attachment => $"aquzio/{tenantSegment}/attachments",
                MediaAssetType.Report => $"aquzio/{tenantSegment}/reports",
                _ => $"aquzio/{tenantSegment}/other"
            };
        }

        private static void ValidateImageMagicBytes(Stream stream)
        {
            if (stream.CanSeek)
            {
                var originalPosition = stream.Position;
                try
                {
                    stream.Position = 0;
                    byte[] header = new byte[8];
                    int bytesRead = stream.Read(header, 0, header.Length);

                    if (bytesRead >= 3)
                    {
                        // JPEG: FF D8 FF
                        if (header[0] == 0xFF && header[1] == 0xD8 && header[2] == 0xFF)
                            return;

                        // PNG: 89 50 4E 47 0D 0A 1A 0A
                        if (bytesRead >= 8 && header[0] == 0x89 && header[1] == 0x50 && header[2] == 0x4E && header[3] == 0x47)
                            return;

                        // GIF: GIF87a or GIF89a
                        if (bytesRead >= 6 && header[0] == 0x47 && header[1] == 0x49 && header[2] == 0x46)
                            return;

                        // WEBP: starts with "RIFF" (52 49 46 46)
                        if (bytesRead >= 4 && header[0] == 0x52 && header[1] == 0x49 && header[2] == 0x46 && header[3] == 0x46)
                            return;

                        // BMP: 42 4D
                        if (bytesRead >= 2 && header[0] == 0x42 && header[1] == 0x4D)
                            return;
                    }
                }
                finally
                {
                    stream.Position = originalPosition;
                }
            }
        }
    }
}
