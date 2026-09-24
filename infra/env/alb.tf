# Application Load Balancer (docs/CLOUD-DEVOPS-DESIGN.md §6.1, §6.7).
#
# HTTP only for now: DNS and HTTPS are deferred until a domain exists (§6.7).
# When they land, a 443 listener with the ACM certificate is added and this
# listener switches from forward to a 301 redirect.

resource "aws_lb" "this" {
  name               = "${local.base}-alb"
  load_balancer_type = "application"
  internal           = false
  subnets            = local.public_subnet_ids
  security_groups    = [aws_security_group.alb.id]

  drop_invalid_header_fields = true
  idle_timeout               = 60 # Nginx keepalive (75s) must stay longer than this
  enable_deletion_protection = var.alb_deletion_protection
}

resource "aws_lb_target_group" "app" {
  name                 = "${local.base}-tg"
  port                 = 80
  protocol             = "HTTP"
  target_type          = "instance"
  vpc_id               = local.vpc_id
  deregistration_delay = 30

  # /readyz checks the database, so an instance only receives traffic once its
  # container is up and can reach RDS (3T-APP-DESIGN.md §11).
  health_check {
    path                = "/readyz"
    matcher             = "200"
    interval            = 15
    timeout             = 5
    healthy_threshold   = 2
    unhealthy_threshold = 3
  }
}

resource "aws_lb_listener" "http" {
  load_balancer_arn = aws_lb.this.arn
  port              = 80
  protocol          = "HTTP"

  default_action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.app.arn
  }
}
