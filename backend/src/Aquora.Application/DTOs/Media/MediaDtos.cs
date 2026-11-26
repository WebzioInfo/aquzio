using System;
using System.Text.Json.Serialization;

namespace Aquora.Application.DTOs.Media
{
    public enum MediaAssetType
    {
        UserProfilePhoto,
        CompanyLogo,
        CompanyCover,
        CompanyGallery,
        QcSignature,
        QcProfilePhoto,
        Document,
        Attachment,
        Report,
        Other
    }

    public class CloudinaryUploadResult
    {
        public string Url { get; set; } = string.Empty;
        public string PublicId { get; set; } = string.Empty;
        public string Format { get; set; } = string.Empty;
        public long Bytes { get; set; }
        public int Width { get; set; }
        public int Height { get; set; }
        public string ResourceType { get; set; } = "image";
        public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    }

    public class MediaUploadResponseDto
    {
        [JsonPropertyName("url")]
        public string Url { get; set; } = string.Empty;

        [JsonPropertyName("publicId")]
        public string PublicId { get; set; } = string.Empty;

        [JsonPropertyName("format")]
        public string Format { get; set; } = string.Empty;

        [JsonPropertyName("bytes")]
        public long Bytes { get; set; }

        [JsonPropertyName("width")]
        public int Width { get; set; }

        [JsonPropertyName("height")]
        public int Height { get; set; }

        [JsonPropertyName("assetType")]
        public string AssetType { get; set; } = string.Empty;
    }
}
