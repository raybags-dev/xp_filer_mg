
output "media_bucket_name" {
  description = "S3 bucket used for image uploads"
  value       = aws_s3_bucket.media_bucket.id
}

output "log_bucket_name" {
  description = "S3 bucket used for access logs"
  value       = aws_s3_bucket.log_bucket.id
}

output "upload_queue_url" {
  description = "SQS upload queue URL"
  value       = aws_sqs_queue.upload_queue.id
}

output "upload_queue_arn" {
  description = "SQS upload queue ARN"
  value       = aws_sqs_queue.upload_queue.arn
}

output "completion_queue_url" {
  description = "SQS completion queue URL"
  value       = aws_sqs_queue.completion_queue.id
}

output "completion_queue_arn" {
  description = "SQS completion queue ARN"
  value       = aws_sqs_queue.completion_queue.arn
}

output "state_machine_arn" {
  description = "Image processing Step Functions state machine ARN"
  value       = aws_sfn_state_machine.image_pipeline.arn
}

output "idempotency_table_name" {
  description = "DynamoDB idempotency table name"
  value       = aws_dynamodb_table.idempotency.name
}

output "idempotency_table_arn" {
  description = "DynamoDB idempotency table ARN"
  value       = aws_dynamodb_table.idempotency.arn
}

output "idempotency_policy_arn" {
  description = "IAM policy ARN for API idempotency access"
  value       = aws_iam_policy.idempotency_access.arn
}

output "lambda_function_names" {
  description = "Deployed Lambda function names"
  value = [
    aws_lambda_function.l2_sqs_listener.function_name,
    aws_lambda_function.l3_validator.function_name,
    aws_lambda_function.l4_processor.function_name,
    aws_lambda_function.l5_finalizer.function_name
  ]
}
