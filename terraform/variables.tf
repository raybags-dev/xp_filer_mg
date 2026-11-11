
variable "aws_region" {
  description = "AWS deployment region"
  type        = string
  default     = "eu-central-1"
}

variable "bucket_name" {
  description = "Unique S3 bucket name for uploaded images"
  type        = string
}

variable "environment" {
  description = "Deployment environment"
  type        = string
  default     = "dev"
}

variable "budget_limit" {
  description = "Monthly AWS budget limit in USD"
  type        = string
  default     = "20"
}

variable "alert_email" {
  description = "Email address receiving AWS budget notifications"
  type        = string
}