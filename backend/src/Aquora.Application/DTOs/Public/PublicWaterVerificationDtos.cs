using System;
using System.Collections.Generic;
using System.Text.Json.Serialization;

namespace Aquora.Application.DTOs.Public
{
    public class PublicBatchVerificationResponseDto
    {
        [JsonPropertyName("success")]
        public bool Success { get; set; }

        [JsonPropertyName("verified")]
        public bool Verified { get; set; }

        [JsonPropertyName("code")]
        public string? Code { get; set; }

        [JsonPropertyName("message")]
        public string? Message { get; set; }

        [JsonPropertyName("data")]
        public PublicBatchVerificationDataDto? Data { get; set; }
    }

    public class PublicBatchVerificationDataDto
    {
        [JsonPropertyName("batchNumber")]
        public string BatchNumber { get; set; } = string.Empty;

        [JsonPropertyName("reportNumber")]
        [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
        public string? ReportNumber { get; set; }

        [JsonPropertyName("sampleCode")]
        [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
        public string? SampleCode { get; set; }

        [JsonPropertyName("sampleNumber")]
        [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
        public string? SampleNumber { get; set; }

        [JsonPropertyName("testedBy")]
        [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
        public string? TestedBy { get; set; }

        [JsonPropertyName("verifiedBy")]
        [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
        public string? VerifiedBy { get; set; }

        [JsonPropertyName("collectedBy")]
        [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
        public string? CollectedBy { get; set; }

        [JsonPropertyName("reportType")]
        [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
        public string? ReportType { get; set; }

        [JsonPropertyName("sampleTime")]
        [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
        public string? SampleTime { get; set; }

        [JsonPropertyName("collectedOn")]
        [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
        public string? CollectedOn { get; set; }

        [JsonPropertyName("remarks")]
        [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
        public string? Remarks { get; set; }

        [JsonPropertyName("manufacturer")]
        public PublicManufacturerDto Manufacturer { get; set; } = new();

        [JsonPropertyName("manufacturing")]
        public PublicManufacturingDto Manufacturing { get; set; } = new();

        [JsonPropertyName("expiry")]
        public PublicExpiryDto Expiry { get; set; } = new();

        [JsonPropertyName("licenses")]
        public PublicLicensesDto Licenses { get; set; } = new();

        [JsonPropertyName("waterQuality")]
        public PublicWaterQualityDto WaterQuality { get; set; } = new();

        [JsonPropertyName("parameters")]
        [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
        public List<PublicWaterTestParameterDto>? Parameters { get; set; }

        [JsonPropertyName("report")]
        public PublicReportDto Report { get; set; } = new();
    }

    public class PublicWaterTestParameterDto
    {
        [JsonPropertyName("name")]
        public string Name { get; set; } = string.Empty;

        [JsonPropertyName("category")]
        public string? Category { get; set; }

        [JsonPropertyName("result")]
        public string? Result { get; set; }

        [JsonPropertyName("value")]
        public double? Value { get; set; }

        [JsonPropertyName("unit")]
        public string? Unit { get; set; }

        [JsonPropertyName("standard")]
        public string? Standard { get; set; }

        [JsonPropertyName("status")]
        public string? Status { get; set; }

        [JsonPropertyName("qualityStatus")]
        public string? QualityStatus { get; set; }
    }

    public class PublicManufacturingDto
    {
        [JsonPropertyName("manufacturedDate")]
        public string? ManufacturedDate { get; set; }
    }

    public class PublicExpiryDto
    {
        [JsonPropertyName("bestBefore")]
        public string? BestBefore { get; set; }

        [JsonPropertyName("shelfLifeMonths")]
        public int ShelfLifeMonths { get; set; } = 6;
    }

    public class PublicLicensesDto
    {
        [JsonPropertyName("fssai")]
        [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
        public string? Fssai { get; set; }

        [JsonPropertyName("bis")]
        [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
        public string? Bis { get; set; }

        [JsonPropertyName("others")]
        [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
        public List<PublicCustomLicenseDto>? Others { get; set; }
    }

    public class PublicCustomLicenseDto
    {
        [JsonPropertyName("name")]
        public string Name { get; set; } = string.Empty;

        [JsonPropertyName("number")]
        public string Number { get; set; } = string.Empty;
    }

    public class PublicWaterQualityDto
    {
        [JsonPropertyName("ph")]
        public string? Ph { get; set; }

        [JsonPropertyName("tds")]
        public string? Tds { get; set; }

        [JsonPropertyName("turbidity")]
        public string? Turbidity { get; set; }

        [JsonPropertyName("colour")]
        [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
        public string? Colour { get; set; }

        [JsonPropertyName("odour")]
        [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
        public string? Odour { get; set; }

        [JsonPropertyName("taste")]
        [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
        public string? Taste { get; set; }

        [JsonPropertyName("sulphate")]
        [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
        public string? Sulphate { get; set; }

        [JsonPropertyName("chloride")]
        [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
        public string? Chloride { get; set; }

        [JsonPropertyName("alkalinity")]
        [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
        public string? Alkalinity { get; set; }

        [JsonPropertyName("residualFreeChlorine")]
        [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
        public string? ResidualFreeChlorine { get; set; }

        [JsonPropertyName("ecoli")]
        [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
        public string? EColi { get; set; }

        [JsonPropertyName("coliform")]
        [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
        public string? Coliform { get; set; }

        [JsonPropertyName("pseudomonas")]
        [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
        public string? Pseudomonas { get; set; }

        [JsonPropertyName("clostridia")]
        [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
        public string? Clostridia { get; set; }

        [JsonPropertyName("aerobicCount22")]
        [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
        public string? AerobicCount22 { get; set; }

        [JsonPropertyName("aerobicCount37")]
        [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
        public string? AerobicCount37 { get; set; }

        [JsonPropertyName("yeastAndMold")]
        [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
        public string? YeastAndMold { get; set; }

        [JsonPropertyName("microbiology")]
        public string? Microbiology { get; set; }

        [JsonPropertyName("sterilization")]
        public string? Sterilization { get; set; }
    }

    public class PublicReportDto
    {
        [JsonPropertyName("available")]
        public bool Available { get; set; }

        [JsonPropertyName("publicDownloadAvailable")]
        public bool PublicDownloadAvailable { get; set; } = false;
    }
}
