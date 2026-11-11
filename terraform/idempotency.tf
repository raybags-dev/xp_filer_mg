
resource "aws_dynamodb_table" "idempotency" {
  name         = "image-pipeline-idempotency"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "idempotencyKey"

  attribute {
    name = "idempotencyKey"
    type = "S"
  }

  ttl {
    attribute_name = "expiresAt"
    enabled        = true
  }

  server_side_encryption {
    enabled = true
  }

  tags = {
    Name        = "image-pipeline-idempotency"
    Environment = var.environment
    ManagedBy   = "Terraform"
  }
}

resource "aws_iam_policy" "idempotency_access" {
  name        = "image-pipeline-idempotency-access"
  description = "Allows the application to read and write upload idempotency records"

  policy = jsonencode({
    Version = "2012-10-17"

    Statement = [{
      Effect = "Allow"

      Action = [
        "dynamodb:GetItem",
        "dynamodb:PutItem"
      ]

      Resource = aws_dynamodb_table.idempotency.arn
    }]
  })
}
