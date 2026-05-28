# -*- coding: utf-8 -*-
{
    'name': 'Pass - Gestión de Daños / Mantenimiento',
    'version': '19.0.1.0.0',
    'category': 'Fleet',
    'summary': 'Integración con app externa de Gestión de Daños y Mantenimiento Vehicular',
    'description': """
        Módulo de integración con la app Gestión de Daños - Pass Rent a Car
        ====================================================================

        Este módulo:
        - Agrega un menú en Rental llamado "Gestión de Daños/Mant" que abre la app externa
        - Agrega un campo en res.users (x_can_access_danos) que controla si el usuario
          puede o no iniciar sesión en la app externa
        - El campo se gestiona desde la ficha del usuario (tab "Pass — Apps Externas")

        Integración con: https://gestion-danos.odoo-server.online

        Desarrollado para: Pass Rent a Car Guatemala
        Consultor: Publitag / JJ
    """,
    'author': 'Publitag',
    'website': 'https://www.publitag.com',
    'license': 'LGPL-3',
    'depends': [
        'base',
        'sale_renting',
    ],
    'data': [
        'security/ir.model.access.csv',
        'data/gestion_danos_action.xml',
        'views/res_users_views.xml',
        'views/menu_gestion_danos.xml',
    ],
    'installable': True,
    'application': False,
    'auto_install': False,
}
