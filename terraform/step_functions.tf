
resource "aws_sfn_state_machine" "image_pipeline" {
  name     = "ImageProcessingPipeline"
  role_arn = aws_iam_role.sfn_role.arn

  definition = jsonencode({
    Comment = "Image processing pipeline: validate, process and finalize"

    StartAt = "ValidateImage"

    States = {
      ValidateImage = {
        Type     = "Task"
        Resource = aws_lambda_function.l3_validator.arn
        Next     = "ProcessImage"
      }

      ProcessImage = {
        Type     = "Task"
        Resource = aws_lambda_function.l4_processor.arn
        Next     = "FinalizeImage"
      }

      FinalizeImage = {
        Type     = "Task"
        Resource = aws_lambda_function.l5_finalizer.arn
        End      = true
      }
    }
  })

  depends_on = [
    aws_iam_role_policy.sfn_lambda_permissions
  ]

  tags = {
    Environment = var.environment
    ManagedBy   = "Terraform"
  }
}
