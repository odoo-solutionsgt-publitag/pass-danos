# -*- coding: utf-8 -*-
from odoo import fields, models


class ResUsers(models.Model):
    _inherit = 'res.users'

    x_can_access_danos = fields.Boolean(
        string='Puede acceder a Gestión de Daños',
        default=False,
        help='Si está marcado, el usuario podrá iniciar sesión en la app externa '
             'de Gestión de Daños / Mantenimiento '
             '(https://gestion-danos.odoo-server.online) usando sus credenciales de Odoo.',
    )
