[ Frontend: index.html ] 
        │
        ▼ (Direct S3 Presigned Upload or API upload)
[ S3 Bucket ] ────(S3 Event Notification)────► [ SQS Queue ]
                                                     │
                                                     ▼ (Event Source Mapping)
                                             [ Worker Lambda: L2 ]
                                                     │
                                                     ▼ (Starts Execution)
                                          [ AWS Step Functions ]
                                         ┌───────────┴───────────┐
                                         ▼                       ▼
                                   [ L3: Validate ]      [ L4: Process & Metadata ]
                                                                 │
                                                                 ▼
                                                         [ L5: Finalize & Notify ]
                                                                 │
                                                                 ▼
                                                        [ SQS Completion Queue ]